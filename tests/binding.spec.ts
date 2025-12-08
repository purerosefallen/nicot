import { Entity } from 'typeorm';
import { IdBase } from '../src/bases';
import {
  BindingColumn,
  BindingValue,
  IntColumn,
  NotQueryable,
  QueryFullText,
  StringColumn,
} from '../src/decorators';
import { Injectable } from '@nestjs/common';
import { CrudService } from '../src/crud-base';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

@Entity()
class Article extends IdBase() {
  @NotQueryable()
  @StringColumn(100)
  name: string;

  @BindingColumn()
  @IntColumn('int', {
    unsigned: true,
  })
  userId: number;

  @BindingColumn('app')
  @IntColumn('int', {
    unsigned: true,
  })
  appId: number;
}

@Injectable()
class ArticleService extends CrudService(Article) {
  setTestUserId(id: number) {
    this._testUserId = id;
  }

  @BindingValue()
  private _testUserId: number;

  setTestAppId(id: number) {
    this._testAppId = id;
  }

  @BindingValue('app')
  async getTestAppId() {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return this._testAppId;
  }

  private _testAppId: number;

  constructor(@InjectRepository(Article) repo) {
    super(repo);
  }
}

@Injectable()
class SlowArticleService extends ArticleService {
  constructor(@InjectRepository(Article) repo) {
    super(repo);
  }

  override async findAll(
    ...args: Parameters<typeof ArticleService.prototype.findAll>
  ) {
    await this.beforeSuper(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    return super.findAll(...args);
  }
}

@Entity()
class BindingValueEntity extends IdBase() {
  @BindingColumn('prop')
  @IntColumn('int', { unsigned: true })
  propUserId: number;

  @BindingColumn('getter')
  @IntColumn('int', { unsigned: true })
  getterUserId: number;

  @BindingColumn('method')
  @IntColumn('int', { unsigned: true })
  methodUserId: number;

  @BindingColumn('async')
  @IntColumn('int', { unsigned: true })
  asyncUserId: number;
}

@Injectable()
class BindingValueCasesService extends CrudService(BindingValueEntity) {
  // 1. property
  @BindingValue('prop')
  propUserIdValue = 1;

  // 2. getter（accessor）
  private _getterUserIdValue = 2;

  @BindingValue('getter')
  get getterUserIdValue() {
    return this._getterUserIdValue;
  }

  // 3. method
  private _methodUserIdValue = 3;

  @BindingValue('method')
  methodUserIdValue() {
    return this._methodUserIdValue;
  }

  // 4. async method
  private _asyncUserIdValue = 4;

  @BindingValue('async')
  async asyncUserIdValue() {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return this._asyncUserIdValue;
  }

  constructor(@InjectRepository(BindingValueEntity) repo) {
    super(repo);
  }
}

describe('binding', () => {
  let app: NestExpressApplication;
  let articleService: ArticleService;
  let slowArticleService: SlowArticleService;
  let bindingValueCasesService: BindingValueCasesService;

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
        TypeOrmModule.forFeature([Article, BindingValueEntity]),
      ],
      providers: [ArticleService, SlowArticleService, BindingValueCasesService],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>();
    await app.init();

    articleService = app.get(ArticleService);
    slowArticleService = app.get(SlowArticleService);
    bindingValueCasesService = app.get(BindingValueCasesService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('@BindingValue(method) should limit rows by current user', async () => {
    const noopRes = await articleService.create({
      name: 'Noop Article',
      appId: 1,
      userId: 2,
    } as Article);

    articleService.setTestAppId(44);
    articleService.setTestUserId(7);

    // create with binding values
    const article1Res = await articleService.create({
      name: 'First Article',
    } as Article);

    expect(article1Res.data.appId).toBe(44);
    expect(article1Res.data.userId).toBe(7);

    // query with binding values
    const articleQueryRes = await articleService.findAll({});
    expect(articleQueryRes.data).toHaveLength(1);
    expect(articleQueryRes.data[0].name).toBe('First Article');
    expect(articleQueryRes.data[0].appId).toBe(44);
    expect(articleQueryRes.data[0].userId).toBe(7);

    // change binding values to get no data
    articleService.setTestAppId(144);
    articleService.setTestUserId(222);
    const articleQueryRes2 = await articleService.findAll({});
    expect(articleQueryRes2.data).toHaveLength(0);

    // update with binding values
    articleService.setTestAppId(44);
    articleService.setTestUserId(7);
    await articleService.update(article1Res.data.id, {
      name: 'Updated First Article',
    });

    const queryAgain = await articleService.findAll({});
    expect(queryAgain.data).toHaveLength(1);
    expect(queryAgain.data[0].name).toBe('Updated First Article');

    await expect(
      articleService.update(noopRes.data.id, {
        name: 'Should Not Update',
      }),
    ).rejects.toThrow();
  });

  it('useBinding should apply binding per call', async () => {
    // 先插一条“不受 binding 限制”的记录，方便后面验证过滤效果
    const noopRes = await articleService.create({
      name: 'Noop Article',
      appId: 1,
      userId: 2,
    } as Article);

    // 不依赖 @BindingValue 的 backing 字段，走 useBinding 提供 binding 值
    const article1Res = await articleService
      .useBinding(7) // 默认 bindingKey: user
      .useBinding(44, 'app') // app 维度的 binding
      .create({
        name: 'First Article (useBinding)',
      } as Article);

    expect(article1Res.data.appId).toBe(44);
    expect(article1Res.data.userId).toBe(7);

    // 带同样的 binding 查，只能查到这条
    const articleQueryRes = await articleService
      .useBinding(7)
      .useBinding(44, 'app')
      .findAll({});

    expect(articleQueryRes.data).toHaveLength(1);
    expect(articleQueryRes.data[0].name).toBe('First Article (useBinding)');
    expect(articleQueryRes.data[0].appId).toBe(44);
    expect(articleQueryRes.data[0].userId).toBe(7);

    // 换 binding（user 不同），查不到
    const articleQueryResWrongUser = await articleService
      .useBinding(9999)
      .useBinding(44, 'app')
      .findAll({});
    expect(articleQueryResWrongUser.data).toHaveLength(0);

    // 换 binding（app 不同），也查不到
    const articleQueryResWrongApp = await articleService
      .useBinding(7)
      .useBinding(145, 'app')
      .findAll({});
    expect(articleQueryResWrongApp.data).toHaveLength(0);

    // 正确 binding 下可以更新
    await articleService
      .useBinding(7)
      .useBinding(44, 'app')
      .update(article1Res.data.id, {
        name: 'Updated First Article (useBinding)',
      });

    const queryAfterUpdate = await articleService
      .useBinding(7)
      .useBinding(44, 'app')
      .findAll({});
    expect(queryAfterUpdate.data).toHaveLength(1);
    expect(queryAfterUpdate.data[0].name).toBe(
      'Updated First Article (useBinding)',
    );

    // 用错误 binding 更新应该失败（被绑定约束拦掉）
    await expect(
      articleService
        .useBinding(9999)
        .useBinding(44, 'app')
        .update(article1Res.data.id, {
          name: 'Should Not Update',
        }),
    ).rejects.toThrow();

    // 同理，更新 noopRes（userId=2, appId=1）在当前 binding 下也应该失败
    await expect(
      articleService
        .useBinding(7)
        .useBinding(44, 'app')
        .update(noopRes.data.id, {
          name: 'Should Not Update Too',
        }),
    ).rejects.toThrow();
  });

  /**
   * 通用并发隔离测试
   */
  async function testConcurrentIsolation(
    service: ArticleService | SlowArticleService,
  ) {
    const repo = service.repo;

    // 准备两条不同 binding 维度的数据
    await repo.save(
      Object.assign(new Article(), {
        name: 'Article U7 A44',
        userId: 7,
        appId: 44,
      }),
    );

    await repo.save(
      Object.assign(new Article(), {
        name: 'Article U8 A45',
        userId: 8,
        appId: 45,
      }),
    );

    // 并发执行两个查找
    const [res1, res2] = await Promise.all([
      service.useBinding(7).useBinding(44, 'app').findAll({}),
      service.useBinding(8).useBinding(45, 'app').findAll({}),
    ]);

    // ----------- 理想行为检验（若实现有并发问题，这会 FAIL） -----------

    // Result 1 应只看到 U7 A44
    expect(res1.data).toHaveLength(1);
    expect(res1.data[0].userId).toBe(7);
    expect(res1.data[0].appId).toBe(44);
    expect(res1.data[0].name).toBe('Article U7 A44');

    // Result 2 应只看到 U8 A45
    expect(res2.data).toHaveLength(1);
    expect(res2.data[0].userId).toBe(8);
    expect(res2.data[0].appId).toBe(45);
    expect(res2.data[0].name).toBe('Article U8 A45');

    // 不能串号
    expect(res1.data[0].id).not.toBe(res2.data[0].id);
  }

  it('useBinding should isolate concurrent calls (articleService)', async () => {
    await testConcurrentIsolation(articleService);
  });

  it('useBinding should isolate concurrent calls (slowArticleService)', async () => {
    await testConcurrentIsolation(slowArticleService);
  });

  it('BindingValue should support property / getter / method / async method', async () => {
    // 通过 create 触发 BindingValue 采集与 BindingColumn 写入
    const created = await bindingValueCasesService.create({} as any);

    expect(created.data.propUserId).toBe(1);
    expect(created.data.getterUserId).toBe(2);
    expect(created.data.methodUserId).toBe(3);
    expect(created.data.asyncUserId).toBe(4);

    // 再查一遍，验证 findAll 时的 binding 也正常工作
    const result = await bindingValueCasesService.findAll({});
    expect(result.data).toHaveLength(1);

    const row = result.data[0];
    expect(row.propUserId).toBe(1);
    expect(row.getterUserId).toBe(2);
    expect(row.methodUserId).toBe(3);
    expect(row.asyncUserId).toBe(4);
  });
});
