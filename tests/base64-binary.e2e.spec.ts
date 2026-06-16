// tests/base64-binary.e2e.spec.ts
import { NestExpressApplication } from '@nestjs/platform-express';
import { Controller, Injectable } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { RestfulFactory } from '../src/restful';
import { IdBase } from '../src/bases';
import { Entity } from 'typeorm';
import {
  Base64BinaryColumn,
  QueryBase64Equal,
  QueryEqual,
  StringColumn,
} from '../src/decorators';

// -------------------- entity --------------------

@Entity()
class BinaryFile extends IdBase() {
  @StringColumn(64, { required: true })
  @QueryEqual()
  name: string;

  @Base64BinaryColumn({ required: true })
  data: string;

  @Base64BinaryColumn()
  @QueryBase64Equal()
  signature: string;
}

// -------------------- restful factory + dtos --------------------

const dec = new RestfulFactory(BinaryFile);

class BinaryFileCreateDto extends dec.createDto {}
class BinaryFileUpdateDto extends dec.updateDto {}
class BinaryFileFindAllDto extends dec.findAllDto {}

// -------------------- service --------------------

@Injectable()
class BinaryFileService extends dec.crudService() {
  constructor(@InjectDataSource() db: DataSource) {
    super(db.getRepository(BinaryFile));
  }
}

// -------------------- controller --------------------

@Controller('binary-file')
class BinaryFileController {
  constructor(private readonly svc: BinaryFileService) {}

  @dec.create()
  create(@dec.createParam() dto: BinaryFileCreateDto) {
    return this.svc.create(dto as any);
  }

  @dec.findAll()
  findAll(@dec.findAllParam() dto: BinaryFileFindAllDto) {
    return this.svc.findAll(dto as any);
  }

  @dec.findOne()
  findOne(@dec.idParam() id: number) {
    return this.svc.findOne(id);
  }

  @dec.update()
  update(
    @dec.idParam() id: number,
    @dec.updateParam() dto: BinaryFileUpdateDto,
  ) {
    return this.svc.update(id, dto as any);
  }

  @dec.delete()
  delete(@dec.idParam() id: number) {
    return this.svc.delete(id);
  }
}

const HELLO = 'hello world';
const HELLO_B64 = Buffer.from(HELLO).toString('base64');
const BYE = 'goodbye world';
const BYE_B64 = Buffer.from(BYE).toString('base64');
const SIG = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
const SIG_B64 = SIG.toString('base64');

describe('Base64BinaryColumn CRUD e2e (supertest)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          dropSchema: true,
          synchronize: true,
          autoLoadEntities: true,
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'postgres',
          database: 'postgres',
          logging: false,
        }),
        TypeOrmModule.forFeature([BinaryFile]),
      ],
      providers: [BinaryFileService],
      controllers: [BinaryFileController],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs the full base64 binary CRUD lifecycle', async () => {
    const server = app.getHttpServer();
    const db = app.get(DataSource);
    const repo = db.getRepository(BinaryFile);

    // ---- CREATE ----
    const created = await request(server)
      .post('/binary-file')
      .send({ name: 'file-1', data: HELLO_B64, signature: SIG_B64 })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
        // API round-trips base64 strings.
        expect(res.body.data.data).toBe(HELLO_B64);
        expect(res.body.data.signature).toBe(SIG_B64);
      });

    const id = created.body.data.id as number;

    // ---- DB stores raw binary (Buffer), not base64 text ----
    const rawRows = await db.query(
      `SELECT data, signature FROM binary_file WHERE id = $1`,
      [id],
    );
    expect(Buffer.isBuffer(rawRows[0].data)).toBe(true);
    expect((rawRows[0].data as Buffer).toString()).toBe(HELLO);
    expect((rawRows[0].signature as Buffer).equals(SIG)).toBe(true);

    // ---- READ one ----
    await request(server)
      .get(`/binary-file/${id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.data).toBe(HELLO_B64);
        expect(res.body.data.signature).toBe(SIG_B64);
      });

    // ---- READ all ----
    await request(server)
      .get('/binary-file')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].data).toBe(HELLO_B64);
      });

    // ---- QUERY by base64 signature (QueryBase64Equal) ----
    await request(server)
      .get('/binary-file')
      .query({ signature: SIG_B64 })
      .expect(200)
      .expect((res) => {
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(id);
      });

    await request(server)
      .get('/binary-file')
      .query({ signature: Buffer.from([0x00]).toString('base64') })
      .expect(200)
      .expect((res) => {
        expect(res.body.data).toHaveLength(0);
      });

    // ---- UPDATE ----
    await request(server)
      .patch(`/binary-file/${id}`)
      .send({ data: BYE_B64 })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      });

    const afterUpdate = await repo.findOneByOrFail({ id } as any);
    // entity-side value is decoded back to a base64 string.
    expect(afterUpdate.data).toBe(BYE_B64);

    await request(server)
      .get(`/binary-file/${id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.data.data).toBe(BYE_B64);
      });

    // ---- DELETE ----
    await request(server).delete(`/binary-file/${id}`).expect(200);

    await request(server).get(`/binary-file/${id}`).expect(404);
  });

  it('accepts a raw Buffer assigned directly at insert time', async () => {
    const db = app.get(DataSource);
    const repo = db.getRepository(BinaryFile);

    // Assign the actual binary (Buffer) instead of its base64 form.
    const ent = repo.create({
      name: 'raw-buffer',
      data: Buffer.from(HELLO) as unknown as string,
      signature: new Uint8Array(SIG) as unknown as string,
    });
    const saved = await repo.save(ent);

    const server = app.getHttpServer();
    await request(server)
      .get(`/binary-file/${saved.id}`)
      .expect(200)
      .expect((res) => {
        // It comes back out as base64 over the API.
        expect(res.body.data.data).toBe(HELLO_B64);
        expect(res.body.data.signature).toBe(SIG_B64);
      });
  });
});
