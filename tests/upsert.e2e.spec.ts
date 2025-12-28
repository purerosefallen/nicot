// test/upsert.e2e.spec.ts
import { NestExpressApplication } from '@nestjs/platform-express';
import { Controller, Injectable } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { RestfulFactory } from '../src/restful';
import { IdBase } from '../src/bases';
import { Entity, ManyToOne, OneToMany } from 'typeorm';
import {
  IntColumn,
  StringColumn,
  UpsertColumn,
  UpsertableEntity,
} from '../src/decorators';

// -------------------- entities --------------------

@UpsertableEntity()
@Entity()
class UpsertParent extends IdBase() {
  @UpsertColumn()
  @StringColumn(64)
  code: string;

  @StringColumn(128)
  title: string;

  @OneToMany(() => UpsertChild, (c) => c.parent)
  children: UpsertChild[];
}

@Entity()
class UpsertChild extends IdBase() {
  @IntColumn('int', { unsigned: true })
  parentId: number;

  @ManyToOne(() => UpsertParent, (p) => p.children, { onDelete: 'CASCADE' })
  parent: UpsertParent;

  @StringColumn(64)
  name: string;
}

// -------------------- restful factory + dtos --------------------
// ✅ relations + upsertIncludeRelations 放在 factory 里（你要求）
const dec = new RestfulFactory(UpsertParent, {
  relations: ['children'],
  upsertIncludeRelations: true,
});

class UpsertParentUpsertDto extends dec.upsertDto {}
class UpsertParentCreateDto extends dec.createDto {}
class UpsertParentFindAllDto extends dec.findAllDto {}

// -------------------- service --------------------

@Injectable()
class UpsertParentService extends dec.crudService() {
  constructor(@InjectDataSource() db: DataSource) {
    super(db.getRepository(UpsertParent));
  }
}

// -------------------- controller --------------------

@Controller('upsert-parent')
class UpsertParentController {
  constructor(private readonly svc: UpsertParentService) {}

  // POST /upsert-parent
  @dec.create()
  create(@dec.createParam() dto: UpsertParentCreateDto) {
    return this.svc.create(dto as any);
  }

  // GET /upsert-parent
  @dec.findAll()
  findAll(@dec.findAllParam() dto: UpsertParentFindAllDto) {
    return this.svc.findAll(dto as any);
  }

  // ✅ PUT /upsert-parent
  @dec.upsert()
  upsert(@dec.upsertParam() dto: UpsertParentUpsertDto) {
    return this.svc.upsert(dto as any);
  }
}

describe('upsert e2e (supertest)', () => {
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
        TypeOrmModule.forFeature([UpsertParent, UpsertChild]),
      ],
      providers: [UpsertParentService],
      controllers: [UpsertParentController],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('PUT /upsert-parent should update existing row and include relations when upsertIncludeRelations=true', async () => {
    const server = app.getHttpServer();
    const db = app.get(DataSource);

    const parentRepo = db.getRepository(UpsertParent);
    const childRepo = db.getRepository(UpsertChild);

    // 1) seed: parent + children
    const p = await parentRepo.save(
      Object.assign(new UpsertParent(), {
        code: 'P001',
        title: 'Original',
      }),
    );

    await childRepo.save(
      Object.assign(new UpsertChild(), { parentId: p.id, name: 'c1' }),
    );
    await childRepo.save(
      Object.assign(new UpsertChild(), { parentId: p.id, name: 'c2' }),
    );

    // 2) upsert by code -> update title, should return children via join
    await request(server)
      .put('/upsert-parent')
      .send({ code: 'P001', title: 'Updated' })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();

        expect(res.body.data.id).toBe(p.id);
        expect(res.body.data.code).toBe('P001');
        expect(res.body.data.title).toBe('Updated');

        expect(Array.isArray(res.body.data.children)).toBe(true);
        expect(res.body.data.children).toHaveLength(2);
        const names = res.body.data.children.map((x: any) => x.name).sort();
        expect(names).toEqual(['c1', 'c2']);
      });

    // 3) ensure no extra parent row was created
    const parents = await parentRepo.find({ where: { code: 'P001' } as any });
    expect(parents).toHaveLength(1);
  });

  it('PUT /upsert-parent should insert when key not exists', async () => {
    const server = app.getHttpServer();
    const db = app.get(DataSource);
    const parentRepo = db.getRepository(UpsertParent);

    await request(server)
      .put('/upsert-parent')
      .send({ code: 'NEW001', title: 'New Row' })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
        expect(res.body.data.code).toBe('NEW001');
        expect(res.body.data.title).toBe('New Row');
      });

    const rows = await parentRepo.find({ where: { code: 'NEW001' } as any });
    expect(rows).toHaveLength(1);
  });

  it('GET /upsert-parent?code=P001 should include relations (relations configured in factory)', async () => {
    const server = app.getHttpServer();
    const db = app.get(DataSource);

    const parentRepo = db.getRepository(UpsertParent);
    const childRepo = db.getRepository(UpsertChild);

    const p = await parentRepo.save(
      Object.assign(new UpsertParent(), { code: 'P001', title: 'Original' }),
    );
    await childRepo.save(
      Object.assign(new UpsertChild(), { parentId: p.id, name: 'c1' }),
    );

    await request(server)
      .get('/upsert-parent?code=P001')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].code).toBe('P001');
        expect(Array.isArray(res.body.data[0].children)).toBe(true);
        expect(res.body.data[0].children).toHaveLength(1);
        expect(res.body.data[0].children[0].name).toBe('c1');
      });
  });
});
