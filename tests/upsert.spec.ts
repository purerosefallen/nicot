import { Entity } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { CrudService } from '../src/crud-base';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { IdBase, StringIdBase } from '../src/bases';
import {
  BindingColumn,
  BindingValue,
  IntColumn,
  StringColumn,
} from '../src/decorators';
import { UpsertableEntity, UpsertColumn } from '../src/decorators/upsert';

@UpsertableEntity()
@Entity()
class SingleUpsertEntity extends IdBase() {
  @UpsertColumn()
  @StringColumn(64)
  code: string;

  @StringColumn(128)
  title: string;
}

@Injectable()
class SingleUpsertService extends CrudService(SingleUpsertEntity) {
  constructor(@InjectRepository(SingleUpsertEntity) repo) {
    super(repo);
  }
}

@UpsertableEntity()
@Entity()
class DoubleUpsertEntity extends IdBase() {
  @UpsertColumn()
  @IntColumn('int', { unsigned: true })
  a: number;

  @UpsertColumn()
  @IntColumn('int', { unsigned: true })
  b: number;

  @StringColumn(128)
  payload: string;
}

@Injectable()
class DoubleUpsertService extends CrudService(DoubleUpsertEntity) {
  constructor(@InjectRepository(DoubleUpsertEntity) repo) {
    super(repo);
  }
}

/**
 * 3) extends StringIdBase() 的情况（无需 UpsertColumn）
 *
 * 这里假设 StringIdBase() 生成的 id 是主键，并且：
 * - 你允许 upsert 只靠 id（不需要 @UpsertColumn）
 * - UpsertableEntity() 不会因为没 UpsertColumn/BindingColumn 就 throw
 *
 * 如果你当前 UpsertableEntity() 强制至少一个 UpsertColumn/BindingColumn，
 * 那你需要：
 *   A) 在 StringIdBase() 内部把 id 标成 upsertColumn
 * 或 B) UpsertableEntity() 对 StringIdBase() 做特判。
 */
@UpsertableEntity()
@Entity()
class StringIdOnlyEntity extends StringIdBase({ length: 32 }) {
  @StringColumn(128)
  title: string;
}

@Injectable()
class StringIdOnlyService extends CrudService(StringIdOnlyEntity) {
  constructor(@InjectRepository(StringIdOnlyEntity) repo) {
    super(repo);
  }
}

/**
 * 4) StringIdBase() + 1 个 UpsertColumn 的情况
 *
 * 这里测试：用 slug 作为 upsert key（同 slug 更新），同时 id 是 string 主键。
 * 你 upsert 的 key 取决于你的实现：
 * - 如果 conflictPaths 只用 upsertColumn + binding，那这里是 slug
 * - 若你想把 id 也纳入 key，需要你在 upsertColumnFields 里包含 id
 */
@UpsertableEntity()
@Entity()
class StringIdWithUpsertEntity extends StringIdBase({ length: 32 }) {
  @UpsertColumn()
  @StringColumn(64)
  slug: string;

  @StringColumn(128)
  title: string;
}

@Injectable()
class StringIdWithUpsertService extends CrudService(StringIdWithUpsertEntity) {
  constructor(@InjectRepository(StringIdWithUpsertEntity) repo) {
    super(repo);
  }
}

/**
 * 5) 1 个 UpsertColumn + 1 个 BindingColumn 的情况
 *
 * key = (userId, code)
 */
@UpsertableEntity()
@Entity()
class BindingUpsertEntity extends IdBase() {
  @BindingColumn() // default binding key
  @IntColumn('int', { unsigned: true })
  userId: number;

  @UpsertColumn()
  @StringColumn(64)
  code: string;

  @StringColumn(128)
  title: string;
}

@Injectable()
class BindingUpsertService extends CrudService(BindingUpsertEntity) {
  @BindingValue()
  private _uid: number;

  setUid(id: number) {
    this._uid = id;
  }

  constructor(@InjectRepository(BindingUpsertEntity) repo) {
    super(repo);
  }
}

describe('upsert', () => {
  let app: NestExpressApplication;

  let singleSvc: SingleUpsertService;
  let doubleSvc: DoubleUpsertService;
  let strIdOnlySvc: StringIdOnlyService;
  let strIdWithUpsertSvc: StringIdWithUpsertService;
  let bindingUpsertSvc: BindingUpsertService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          dropSchema: true,
          synchronize: true,
          autoLoadEntities: true,
          entities: [],
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'postgres',
          database: 'postgres',
          logging: false,
        }),
        TypeOrmModule.forFeature([
          SingleUpsertEntity,
          DoubleUpsertEntity,
          StringIdOnlyEntity,
          StringIdWithUpsertEntity,
          BindingUpsertEntity,
        ]),
      ],
      providers: [
        SingleUpsertService,
        DoubleUpsertService,
        StringIdOnlyService,
        StringIdWithUpsertService,
        BindingUpsertService,
      ],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>();
    await app.init();

    singleSvc = app.get(SingleUpsertService);
    doubleSvc = app.get(DoubleUpsertService);
    strIdOnlySvc = app.get(StringIdOnlyService);
    strIdWithUpsertSvc = app.get(StringIdWithUpsertService);
    bindingUpsertSvc = app.get(BindingUpsertService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should upsert with 1 UpsertColumn', async () => {
    // 1) insert
    const r1 = await singleSvc.upsert({
      code: 'A001',
      title: 'Hello',
    } as any);

    expect(r1.data.id).toBeDefined();
    expect(r1.data.code).toBe('A001');
    expect(r1.data.title).toBe('Hello');

    const id1 = r1.data.id;

    // 2) update by same key
    const r2 = await singleSvc.upsert({
      code: 'A001',
      title: 'Hello (updated)',
    } as any);

    expect(r2.data.id).toBe(id1); // same row
    expect(r2.data.code).toBe('A001');
    expect(r2.data.title).toBe('Hello (updated)');

    const rows = await singleSvc.repo.find({ order: { id: 'ASC' } as any });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id1);
  });

  it('should upsert with 2 UpsertColumns', async () => {
    // insert (a=1,b=2)
    const r1 = await doubleSvc.upsert({
      a: 1,
      b: 2,
      payload: 'v1',
    } as any);

    expect(r1.data.id).toBeDefined();
    const id1 = r1.data.id;

    // update same composite key
    const r2 = await doubleSvc.upsert({
      a: 1,
      b: 2,
      payload: 'v2',
    } as any);

    expect(r2.data.id).toBe(id1);
    expect(r2.data.payload).toBe('v2');

    // insert another composite key (a=1,b=3)
    const r3 = await doubleSvc.upsert({
      a: 1,
      b: 3,
      payload: 'vX',
    } as any);

    expect(r3.data.id).toBeDefined();
    expect(r3.data.id).not.toBe(id1);

    const rows = await doubleSvc.repo.find({ order: { id: 'ASC' } as any });
    expect(rows).toHaveLength(2);
  });

  it('should upsert with StringIdBase() only (by id)', async () => {
    /**
     * 如果你的 StringIdBase() 是 uuid default：
     *   - 第一次 upsert 需要你传 id 吗？
     *     - 若不需要（自动生成），那“按 id upsert”其实无法命中 update 分支
     *     - 所以这个 case 通常意味着：你会传 id（外部 id）
     *
     * 我这里按“外部传 id”写（最稳定，且符合 pk-upsert）。
     */
    const r1 = await strIdOnlySvc.upsert({
      id: 'art_001',
      title: 't1',
    } as any);

    expect(r1.data.id).toBe('art_001');
    expect(r1.data.title).toBe('t1');

    const r2 = await strIdOnlySvc.upsert({
      id: 'art_001',
      title: 't2',
    } as any);

    expect(r2.data.id).toBe('art_001');
    expect(r2.data.title).toBe('t2');

    const rows = await strIdOnlySvc.repo.find();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('art_001');
    expect(rows[0].title).toBe('t2');
  });

  it('StringIdBase + UpsertColumn(slug): (id,slug) as conflict key; id differs allows insert; same id with different slug should error', async () => {
    // 1) insert (id=a1, slug=hello)
    const r1 = await strIdWithUpsertSvc.upsert({
      id: 'a1',
      slug: 'hello',
      title: 't1',
    } as any);

    expect(r1.data.id).toBe('a1');
    expect(r1.data.slug).toBe('hello');
    expect(r1.data.title).toBe('t1');

    // 2) id differs, slug same => should be ANOTHER ROW (no conflict on (id,slug))
    const r2 = await strIdWithUpsertSvc.upsert({
      id: 'a2',
      slug: 'hello',
      title: 't2',
    } as any);

    expect(r2.data.id).toBe('a2');
    expect(r2.data.slug).toBe('hello');

    let rows = await strIdWithUpsertSvc.repo.find({
      order: { id: 'ASC' } as any,
    });
    expect(rows).toHaveLength(2);

    // 3) same id, different slug => PK(id) conflict not captured by ON CONFLICT(id,slug) => should throw
    await expect(
      strIdWithUpsertSvc.upsert({
        id: 'a1',
        slug: 'world',
        title: 'boom',
      } as any),
    ).rejects.toThrow();

    // still 2 rows, and original a1 unchanged
    rows = await strIdWithUpsertSvc.repo.find({ order: { id: 'ASC' } as any });
    expect(rows).toHaveLength(2);
    const a1 = rows.find((x) => x.id === 'a1')!;
    expect(a1.slug).toBe('hello');
    expect(a1.title).toBe('t1');
  });

  it('should upsert with 1 UpsertColumn + 1 BindingColumn (isolation by binding)', async () => {
    // user=7 insert code=X
    bindingUpsertSvc.setUid(7);
    const r1 = await bindingUpsertSvc.upsert({
      code: 'X',
      title: 'u7',
    } as any);

    expect(r1.data.userId).toBe(7);
    expect(r1.data.code).toBe('X');
    expect(r1.data.title).toBe('u7');
    const idU7 = r1.data.id;

    // user=7 update same code=X
    bindingUpsertSvc.setUid(7);
    const r2 = await bindingUpsertSvc.upsert({
      code: 'X',
      title: 'u7-updated',
    } as any);

    expect(r2.data.id).toBe(idU7);
    expect(r2.data.userId).toBe(7);
    expect(r2.data.title).toBe('u7-updated');

    // user=8 upsert same code=X should create new row (different binding scope)
    bindingUpsertSvc.setUid(8);
    const r3 = await bindingUpsertSvc.upsert({
      code: 'X',
      title: 'u8',
    } as any);

    expect(r3.data.userId).toBe(8);
    expect(r3.data.code).toBe('X');
    expect(r3.data.id).toBeDefined();
    expect(r3.data.id).not.toBe(idU7);

    // verify DB has 2 rows, same code, different userId
    const rows = await bindingUpsertSvc.repo.find({
      order: { userId: 'ASC' } as any,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].userId).toBe(7);
    expect(rows[0].code).toBe('X');
    expect(rows[1].userId).toBe(8);
    expect(rows[1].code).toBe('X');
  });

  it('should restore soft-deleted row on upsert (deleteTime -> NULL) and keep same id', async () => {
    // 1) insert
    const r1 = await singleSvc.upsert({
      code: 'SOFT',
      title: 'v1',
    } as any);

    const id1 = r1.data.id;
    expect(id1).toBeDefined();

    // 2) soft delete it
    await singleSvc.repo.softDelete({ id: id1 } as any);

    // sanity: row should be soft-deleted
    const deletedRow = await singleSvc.repo.findOne({
      where: { id: id1 } as any,
      withDeleted: true,
    });
    expect(deletedRow).toBeTruthy();
    expect((deletedRow as any).deleteTime).toBeTruthy();

    // 3) upsert with same key should restore and update
    const r2 = await singleSvc.upsert({
      code: 'SOFT',
      title: 'v2',
    } as any);

    // 4) should be same row id (updated, restored)
    expect(r2.data.id).toBe(id1);
    expect(r2.data.code).toBe('SOFT');
    expect(r2.data.title).toBe('v2');

    // 5) verify in DB: not deleted
    const alive = await singleSvc.repo.findOne({
      where: { id: id1 } as any,
    });
    expect(alive).toBeTruthy();
    expect((alive as any).deleteTime).toBeNull();

    // and still only 1 row for that key (withDeleted included)
    const all = await singleSvc.repo.find({
      where: { code: 'SOFT' } as any,
      withDeleted: true,
    });
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(id1);
  });
});
