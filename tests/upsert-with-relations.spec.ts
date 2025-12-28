// test/upsert.relations.spec.ts
import { Entity, ManyToOne, OneToMany } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { CrudService } from '../src/crud-base';
import { IdBase } from '../src/bases';
import {
  IntColumn,
  StringColumn,
  UpsertColumn,
  UpsertableEntity,
} from '../src/decorators';

@UpsertableEntity()
@Entity()
class Parent extends IdBase() {
  @UpsertColumn()
  @StringColumn(64)
  code: string;

  @StringColumn(128)
  title: string;

  @OneToMany(() => Child, (c) => c.parent)
  children: Child[];
}

@Entity()
class Child extends IdBase() {
  @IntColumn('int', { unsigned: true })
  parentId: number;

  @ManyToOne(() => Parent, (p) => p.children, { onDelete: 'CASCADE' })
  parent: Parent;

  @StringColumn(64)
  name: string;
}

@Injectable()
class ParentService extends CrudService(Parent, {
  // 让 _applyQueryRelations 能 join 到 children
  relations: ['children'],
  // 你的 upsert() 里会读这个开关：如果 true 就 _applyQueryRelations(qb)
  upsertIncludeRelations: true,
}) {
  constructor(@InjectRepository(Parent) repo) {
    super(repo);
  }
}

describe('upsert (include relations)', () => {
  let app: NestExpressApplication;
  let parentService: ParentService;

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
        TypeOrmModule.forFeature([Parent, Child]),
      ],
      providers: [ParentService],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>();
    await app.init();

    parentService = app.get(ParentService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('upsert should return entity with relations when upsertIncludeRelations=true', async () => {
    const parentRepo = parentService.repo;
    const childRepo = parentRepo.manager.getRepository(Child);

    // 1) 先插入 parent（用 save 或 create 都行）
    const createdParent = await parentRepo.save(
      Object.assign(new Parent(), {
        code: 'P001',
        title: 'Original',
      }),
    );

    // 2) 插入两个 child 关联上 parent
    await childRepo.save(
      Object.assign(new Child(), {
        parentId: createdParent.id,
        name: 'c1',
      }),
    );
    await childRepo.save(
      Object.assign(new Child(), {
        parentId: createdParent.id,
        name: 'c2',
      }),
    );

    // 3) upsert 同 code，更新 title
    const upsertRes = await parentService.upsert({
      code: 'P001',
      title: 'Updated',
    } as any);

    // 4) 断言：返回里有 children（被 join 出来）
    expect(upsertRes.data.id).toBe(createdParent.id);
    expect(upsertRes.data.code).toBe('P001');
    expect(upsertRes.data.title).toBe('Updated');

    // 关键断言：relations 被加载
    expect(Array.isArray((upsertRes.data as any).children)).toBe(true);
    expect((upsertRes.data as any).children).toHaveLength(2);

    const childNames = (upsertRes.data as any).children
      .map((c: any) => c.name)
      .sort();
    expect(childNames).toEqual(['c1', 'c2']);

    // 再补一刀：DB 里 parent 没变成两条
    const allParents = await parentRepo.find({
      where: { code: 'P001' } as any,
    });
    expect(allParents).toHaveLength(1);
  });
});
