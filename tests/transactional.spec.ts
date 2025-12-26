// 你的测试 entity（按实际路径改）
import { User, Book, Gender } from './utility/user';
import { Test } from '@nestjs/testing';
import { RestfulFactory } from '../src/restful';
import { Controller, Injectable, Post, UseInterceptors } from '@nestjs/common';
import {
  InjectTransactionalRepository,
  TransactionalTypeOrmInterceptor,
  TransactionalTypeOrmModule,
} from '../src/transactional-typeorm.module';
import { DataSource, Repository } from 'typeorm';
import { BlankReturnMessageDto } from 'nesties';
import { NestExpressApplication } from '@nestjs/platform-express';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';

const dec = new RestfulFactory(User);

/**
 * ✅ NICOT service：用 dec.crudService() 生成
 * 关键点：为了让“事务注入”真正被覆盖到，我们这里注入 TransactionalRepository
 * （否则你就只是用了普通 repo，transactional 体系没被用到）
 */
@Injectable()
class UserService extends dec.crudService() {
  constructor(
    @InjectTransactionalRepository(User)
    repo: Repository<User>,
  ) {
    super(repo);
  }
}

/**
 * ✅ NICOT controller：用 baseController() 生成默认 CRUD endpoints
 * 然后我们加一个额外 endpoint 来验证 rollback
 */
@Controller('tx-user')
@UseInterceptors(TransactionalTypeOrmInterceptor())
class TxUserController extends dec.baseController() {
  constructor(
    private readonly userService: UserService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {
    super(userService);
  }

  /**
   * 故意制造：先写入再抛 404
   * 期望：HTTP 404 + DB rollback（不留数据）
   */
  @Post('fail')
  async createThen404(): Promise<never> {
    await this.userService.repo.save({
      name: 'ROLL',
      age: 21,
      gender: Gender.F,
    } as any);

    throw new BlankReturnMessageDto(404, 'message').toException();
  }

  @Post('tx-proof')
  async txProof(): Promise<never> {
    const created = await this.userService.repo.save({
      name: 'TXVIS',
      age: 22,
      gender: Gender.F,
    } as any);

    const inside = await this.userService.repo.findOne({
      where: { id: created.id },
    });
    if (!inside) throw new Error('Should be visible inside transaction');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    try {
      const outside = await qr.manager.getRepository(User).findOne({
        where: { id: created.id },
      });
      if (outside) throw new Error('Should NOT be visible outside transaction');
    } finally {
      await qr.release();
    }

    throw new BlankReturnMessageDto(404, 'message').toException();
  }
}

describe('transactional-typeorm', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          dropSchema: true,
          synchronize: true,
          entities: [User, Book],
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'postgres',
          database: 'postgres',
          logging: true,
        }),

        /**
         * ✅ 关键：TransactionalTypeOrmModule.forFeature
         * - 提供 Transactional EntityManager/Repository 的 request-scoped provider
         * - 同时 re-export TypeOrmModule.forFeature
         */
        TransactionalTypeOrmModule.forFeature([User, Book]),
      ],
      providers: [UserService],
      controllers: [TxUserController],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should COMMIT for normal nicot create endpoint under transactional interceptor', async () => {
    const server = app.getHttpServer();
    const ds = app.get(DataSource);
    const repo = ds.getRepository(User);

    await request(server)
      .post('/tx-user')
      .send({ name: 'COMOK', age: 20, gender: 'F' })
      .expect(200);

    const rows = await repo.find({ where: { name: 'COMOK' } });
    expect(rows).toHaveLength(1);
  });

  it('should ROLLBACK when throwing BlankReturnMessageDto(404).toException()', async () => {
    const server = app.getHttpServer();
    const ds = app.get(DataSource);
    const repo = ds.getRepository(User);

    await request(server)
      .post('/tx-user/fail')
      .send({})
      .expect(404)
      .expect((res) => {
        // 这里根据你 BlankReturnMessageDto 的实际响应结构调整更严格的断言
        // 我先给一个“至少包含 message”的断言，不假设你的 envelope 字段名
        expect(JSON.stringify(res.body)).toContain('message');
      });

    // ✅ 关键断言：事务应该 rollback，不应有这条记录
    const rows = await repo.find({ where: { name: 'ROLL' } });
    expect(rows).toHaveLength(0);
  });

  it('should prove we are inside a transaction (inside visible, outside invisible) and rollback on 404', async () => {
    const server = app.getHttpServer();
    const ds = app.get(DataSource);
    const repo = ds.getRepository(User);

    await request(server).post('/tx-user/tx-proof').send({}).expect(404);

    // 最终还是要 rollback，数据库里不应留下
    const rows = await repo.find({ where: { name: 'TXVIS' } });
    expect(rows).toHaveLength(0);
  });
});
