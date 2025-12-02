import { NestExpressApplication } from '@nestjs/platform-express';
import { Controller, Injectable } from '@nestjs/common';
import { CrudService } from '../src/crud-base';
import { Book, Gender, User } from './utility/user';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import _ from 'lodash';
import { RestfulFactory } from '../src/restful';
import SJSON from 'superjson';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

@Injectable()
class BookService extends CrudService(Book, {
  relations: ['user'],
}) {
  constructor(@InjectDataSource() db: DataSource) {
    super(db.getRepository(Book));
  }
}

const dec = new RestfulFactory(User);
class FindAllUserDto extends dec.findAllDto {}
class UpdateUserDto extends dec.updateDto {}
class CreateUserDto extends dec.createDto {}
class ImportUserDto extends dec.importDto {}

@Injectable()
class UserService extends dec.crudService() {
  constructor(@InjectDataSource() db: DataSource) {
    super(db.getRepository(User));
  }
}

@Controller('user')
class UserController {
  constructor(private userService: UserService) {}

  @dec.create()
  create(@dec.createParam() user: CreateUserDto) {
    return this.userService.create(user);
  }

  @dec.findOne()
  findOne(@dec.idParam() id: number) {
    return this.userService.findOne(id);
  }

  @dec.findAll()
  findAll(@dec.findAllParam() user: FindAllUserDto) {
    return this.userService.findAll(user);
  }

  @dec.update()
  update(@dec.idParam() id: number, @dec.updateParam() user: UpdateUserDto) {
    return this.userService.update(id, user);
  }

  @dec.delete()
  delete(@dec.idParam() id: number) {
    return this.userService.delete(id);
  }

  @dec.import()
  import(@dec.createParam() data: ImportUserDto) {
    return this.userService.importEntities(data.data);
  }
}

@Controller('user2')
class UserController2 extends dec.baseController() {
  constructor(userService: UserService) {
    super(userService);
  }
}

@Controller('user3')
class SingleUserController extends dec.baseController({}) {
  constructor(@InjectDataSource() db: DataSource) {
    super(db.getRepository(User));
  }
}

describe('dummy1', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});

describe('app', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
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
      ],
      providers: [UserService, BookService],
      controllers: [UserController, UserController2, SingleUserController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    const documentConfig = new DocumentBuilder()
      .setTitle('test')
      .setDescription('test')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup('docs', app, document);
    await app.init();
  });

  // must shutdown nest
  afterAll(async () => {
    await app.close();
  });

  it('should work with database', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();
    const user = new User();
    user.name = 'Yuzu';
    user.bio = 'Hello I am Yuzu';
    user.age = 20;
    user.gender = Gender.F;
    const createResult = await userService.create(user);
    expect(createResult.data).toBeInstanceOf(User);
    const getUser = await userService.findOne(createResult.data.id);
    expect(getUser.data.name).toBe('Yuzu');
    const getUsers = await userService.findAll({ name: 'Yuzu' });
    expect(getUsers.data).toHaveLength(1);
    const getUsersInvalid = await userService.findAll({ name: 'Yuzu1111' });
    expect(getUsersInvalid.data).toHaveLength(0);

    const getUsersByIn = await userService.findAll({ nameIn: 'Yuzu,Someone' });
    expect(getUsersByIn.data).toHaveLength(1);

    const getUsersByInInvalid = await userService.findAll({
      nameIn: 'AAA,BBB',
    });
    expect(getUsersByInInvalid.data).toHaveLength(0);

    const getUsersBySearch1 = await userService.findAll({
      search: 'Yuzu,Anyone',
    });
    expect(getUsersBySearch1.data).toHaveLength(1);

    const getUsersBySearch2 = await userService.findAll({
      search: 'Hello I am Yuzu',
    });
    expect(getUsersBySearch2.data).toHaveLength(1);

    const getUsersBySearchInvalid = await userService.findAll({
      search: 'oooooo',
    });
    expect(getUsersBySearchInvalid.data).toHaveLength(0);

    await userService.update(createResult.data.id, {
      name: 'Nana',
    });
    const getUpdatedUser = await userService.findOne(createResult.data.id);
    expect(getUpdatedUser.data.name).toBe('Nana');
    await userService.delete(createResult.data.id);
    const getDeletedUser = await userService.findAll({ name: 'Nana' });
    expect(getDeletedUser.data).toHaveLength(0);
  });

  it('should work with common pagination', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();
    const hundredUsers = _.range(100).map((i) => {
      const user = new User();
      user.name = `U${i}`;
      user.age = 20 + i;
      user.gender = Gender.F;
      return user;
    });
    const savedHundredUsers = await userService.repo.save(hundredUsers);

    const getUsers = await userService.findAll({
      pageCount: 1,
      recordsPerPage: 20,
    });
    expect(getUsers.data).toHaveLength(20);
    expect(getUsers.pageCount).toBe(1);
    expect(getUsers.recordsPerPage).toBe(20);
    expect(getUsers.total).toBe(100);
    expect(getUsers.totalPages).toBe(5);

    const getUsersPage2 = await userService.findAll({
      pageCount: 2,
      recordsPerPage: 20,
    });
    expect(getUsersPage2.data).toHaveLength(20);
    expect(getUsersPage2.pageCount).toBe(2);
    expect(getUsersPage2.recordsPerPage).toBe(20);
    expect(getUsersPage2.total).toBe(100);
    expect(getUsersPage2.totalPages).toBe(5);

    const partialPage = await userService.findAll({
      pageCount: 3,
      recordsPerPage: 40,
    });
    // there are only 20 records left in the last page
    expect(partialPage.data).toHaveLength(20);
    expect(partialPage.pageCount).toBe(3);
    expect(partialPage.recordsPerPage).toBe(40);
    expect(partialPage.total).toBe(100);
    expect(partialPage.totalPages).toBe(3);
  });

  it('should work with cursor pagination', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();
    const hundredUsers = _.range(100).map((i) => {
      const user = new User();
      user.name = `U${i}`;
      user.age = 120 - i;
      user.gender = Gender.F;
      return user;
    });
    const savedHundredUsers = await userService.repo.save(hundredUsers);

    const firstPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 20,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );
    expect(firstPage.data).toHaveLength(20);
    expect(firstPage.nextCursor).toBeDefined();
    expect(firstPage.previousCursor).toBeUndefined();
    expect(firstPage.data[0].age).toBe(21);
    expect(firstPage.data[19].age).toBe(40);

    console.log(`First page cursor: ${firstPage.nextCursor}`);

    const nextPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 20,
        paginationCursor: firstPage.nextCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(nextPage.data).toHaveLength(20);
    expect(nextPage.nextCursor).toBeDefined();
    expect(nextPage.previousCursor).toBeDefined();
    expect(nextPage.data[0].age).toBe(41);
    expect(nextPage.data[19].age).toBe(60);

    console.log(
      `Next page cursor: ${nextPage.nextCursor} / ${nextPage.previousCursor}`,
    );

    const backToFirstPageAgain = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 20,
        paginationCursor: nextPage.previousCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );
    expect(backToFirstPageAgain.data).toHaveLength(20);
    expect(backToFirstPageAgain.nextCursor).toBe(firstPage.nextCursor);
    expect(backToFirstPageAgain.previousCursor).toBeUndefined();
    expect(backToFirstPageAgain.data[0].age).toBe(21);
    expect(backToFirstPageAgain.data[19].age).toBe(40);
  });

  it('should work with cursor pagination when age is nullable and can roll back', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();

    // 准备数据
    const users = _.range(30).map((i) => {
      const user = new User();
      user.name = `NU${i}`;
      if (i % 5 === 0) {
        user.age = null; // 每5个是null
      } else {
        user.age = i;
      }
      user.gender = Gender.M;
      return user;
    });

    await userService.repo.save(users);

    // 第1页
    const firstPage = await userService.findAllCursorPaginated(
      { recordsPerPage: 10 },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS LAST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(firstPage.data).toHaveLength(10);
    expect(firstPage.nextCursor).toBeDefined();
    expect(firstPage.previousCursor).toBeUndefined();
    expect(firstPage.data[0].age).toBe(1);
    expect(firstPage.data[9].age).toBe(12);

    console.log(`First page cursor (nullable test): ${firstPage.nextCursor}`);

    // 第2页
    const secondPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: firstPage.nextCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS LAST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(secondPage.data).toHaveLength(10);
    expect(secondPage.nextCursor).toBeDefined();
    expect(secondPage.previousCursor).toBeDefined();
    expect(secondPage.data[0].age).toBe(13);
    expect(secondPage.data[9].age).toBe(24);

    console.log(
      `Second page cursor (nullable test): ${secondPage.nextCursor} / ${secondPage.previousCursor}`,
    );

    // 第3页
    const thirdPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: secondPage.nextCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS LAST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(thirdPage.data.length).toBe(10);
    expect(thirdPage.previousCursor).toBeDefined();
    expect(thirdPage.data.some((u) => u.age == null)).toBe(true);

    console.log(
      `Third page cursor (nullable test): ${thirdPage.nextCursor} / ${thirdPage.previousCursor}`,
    );

    // 🌟 回滚到第二页
    const backToSecondPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: thirdPage.previousCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS LAST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(backToSecondPage.data).toHaveLength(10);
    // 确认滚回的数据跟secondPage一致
    expect(backToSecondPage.data.map((d) => d.id)).toEqual(
      secondPage.data.map((d) => d.id),
    );
    expect(backToSecondPage.nextCursor).toBe(secondPage.nextCursor);
    expect(backToSecondPage.previousCursor).toBe(secondPage.previousCursor);

    // 🌟 再回滚到第一页
    const backToFirstPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: backToSecondPage.previousCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS LAST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(backToFirstPage.data).toHaveLength(10);
    expect(backToFirstPage.data.map((d) => d.id)).toEqual(
      firstPage.data.map((d) => d.id),
    );
    expect(backToFirstPage.nextCursor).toBe(firstPage.nextCursor);
    expect(backToFirstPage.previousCursor).toBeUndefined();
  });

  it('should work with cursor pagination when age is nullable with NULLS FIRST and can roll back', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();

    // 准备测试数据
    const users = _.range(30).map((i) => {
      const user = new User();
      user.name = `NU${i}`;
      if (i % 5 === 0) {
        user.age = null; // 每5个是null
      } else {
        user.age = i;
      }
      user.gender = Gender.M;
      return user;
    });

    await userService.repo.save(users);

    // 第1页（第一页应该先出现null的记录）
    const firstPage = await userService.findAllCursorPaginated(
      { recordsPerPage: 10 },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS FIRST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(firstPage.data).toHaveLength(10);
    expect(firstPage.nextCursor).toBeDefined();
    expect(firstPage.previousCursor).toBeUndefined();
    // 前几条应该包含age为null的记录
    expect(firstPage.data.slice(0, 6).every((u) => u.age === null)).toBe(true);

    console.log(
      `First page cursor (NULLS FIRST test): ${firstPage.nextCursor}`,
    );

    // 第2页
    const secondPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: firstPage.nextCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS FIRST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(secondPage.data).toHaveLength(10);
    expect(secondPage.nextCursor).toBeDefined();
    expect(secondPage.previousCursor).toBeDefined();

    // 第二页应该开始出现有age数值的记录了
    expect(secondPage.data[0].age).toBeGreaterThan(0);

    console.log(
      `Second page cursor (NULLS FIRST test): ${secondPage.nextCursor} / ${secondPage.previousCursor}`,
    );

    // 第3页
    const thirdPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: secondPage.nextCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS FIRST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(thirdPage.data.length).toBeGreaterThan(0);
    expect(thirdPage.previousCursor).toBeDefined();

    console.log(
      `Third page cursor (NULLS FIRST test): ${thirdPage.nextCursor} / ${thirdPage.previousCursor}`,
    );

    // 🌟 回滚到第二页
    const backToSecondPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: thirdPage.previousCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS FIRST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(backToSecondPage.data).toHaveLength(10);
    expect(backToSecondPage.data.map((d) => d.id)).toEqual(
      secondPage.data.map((d) => d.id),
    );
    expect(backToSecondPage.nextCursor).toBe(secondPage.nextCursor);
    expect(backToSecondPage.previousCursor).toBe(secondPage.previousCursor);

    // 🌟 再回滚到第一页
    const backToFirstPage = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: backToSecondPage.previousCursor,
      },
      (qb) =>
        qb
          .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS FIRST')
          .addOrderBy(`${userService.entityAliasName}.id`, 'ASC'),
    );

    expect(backToFirstPage.data).toHaveLength(10);
    expect(backToFirstPage.data.map((d) => d.id)).toEqual(
      firstPage.data.map((d) => d.id),
    );
    expect(backToFirstPage.nextCursor).toBe(firstPage.nextCursor);
    expect(backToFirstPage.previousCursor).toBeUndefined();
  });

  it('should paginate correctly with NULLS LAST and support full rollback', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();

    // 准备数据：前15条 age 非null，后15条 age=null
    const users = _.range(30).map((i) => {
      const user = new User();
      user.name = `NL${i}`;
      if (i < 15) {
        user.age = i; // 非null
      } else {
        user.age = null; // 后半部分 null
      }
      user.gender = Gender.M;
      return user;
    });

    await userService.repo.save(users);

    const orderer = (qb: SelectQueryBuilder<User>) =>
      qb
        .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS LAST')
        .addOrderBy(`${userService.entityAliasName}.id`, 'ASC');

    // 第1页
    const page1 = await userService.findAllCursorPaginated(
      { recordsPerPage: 10 },
      orderer,
    );

    console.log(`Page 1: ${JSON.stringify(page1.data)}`);
    console.log(
      `Page 1 cursor: ${JSON.stringify(
        SJSON.parse(Buffer.from(page1.nextCursor, 'base64url').toString()),
      )}`,
    );

    expect(page1.data).toHaveLength(10);
    expect(page1.data.every((u) => u.age !== null)).toBe(true);
    expect(page1.nextCursor).toBeDefined();
    expect(page1.previousCursor).toBeUndefined();

    const lastOfPage1 = page1.data[page1.data.length - 1];

    // 第2页
    const page2 = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: page1.nextCursor,
      },
      orderer,
    );

    console.log(`Page 2: ${JSON.stringify(page2.data)}`);
    console.log(
      `Page 2 cursor: ${JSON.stringify(
        SJSON.parse(Buffer.from(page2.nextCursor, 'base64url').toString()),
      )}`,
    );

    expect(page2.data).toHaveLength(10);
    expect(page2.previousCursor).toBeDefined();
    expect(page2.nextCursor).toBeDefined();

    const firstOfPage2 = page2.data[0];
    expect(firstOfPage2.id).toBeGreaterThan(lastOfPage1.id);

    // 第二页数据可能是非null或者开始进入null，做一个检查
    expect(page2.data.slice(0, 5).every((u) => u.age !== null)).toBe(true);
    expect(page2.data.slice(5).every((u) => u.age === null)).toBe(true);

    const lastOfPage2 = page2.data[page2.data.length - 1];

    // 第3页
    const page3 = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: page2.nextCursor,
      },
      orderer,
    );

    console.log(`Page 3: ${JSON.stringify(page3.data)}`);
    console.log(
      `Page 3 previous cursor: ${JSON.stringify(
        SJSON.parse(Buffer.from(page3.previousCursor, 'base64url').toString()),
      )}`,
    );

    const firstOfPage3 = page3.data[0];
    expect(firstOfPage3.id).toBeGreaterThan(lastOfPage2.id);

    expect(page3.data.length).toBeGreaterThan(0);
    expect(page3.previousCursor).toBeDefined();
    expect(page3.nextCursor).toBeUndefined();

    // 第三页应该基本全是 null
    expect(page3.data.every((u) => u.age === null)).toBe(true);

    // ⬅ 回滚到第2页
    const page2Back = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: page3.previousCursor,
      },
      orderer,
    );
    expect(page2Back.data.map((u) => u.id)).toEqual(
      page2.data.map((u) => u.id),
    );
    expect(page2Back.nextCursor).toBe(page2.nextCursor);
    expect(page2Back.previousCursor).toBe(page2.previousCursor);

    // ⬅ 回滚到第1页
    const page1Back = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: page2Back.previousCursor,
      },
      orderer,
    );
    expect(page1Back.data.map((u) => u.id)).toEqual(
      page1.data.map((u) => u.id),
    );
    expect(page1Back.nextCursor).toBe(page1.nextCursor);
    expect(page1Back.previousCursor).toBeUndefined();

    // 🔥 补充一个断言：第一页不应该包含null
    expect(page1Back.data.every((u) => u.age !== null)).toBe(true);

    // 🔥 补充一个断言：最后一页（page3）全是null
    expect(page3.data.every((u) => u.age === null)).toBe(true);
  });

  it('should support full forward and backward cursor pagination when first page is all null (NULLS FIRST)', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();

    // 准备数据：前15条 age=null，后15条 age = 非 null
    const users = _.range(30).map((i) => {
      const user = new User();
      user.name = `NN${i}`;
      if (i < 15) {
        user.age = null;
      } else {
        user.age = i;
      }
      user.gender = Gender.M;
      return user;
    });

    await userService.repo.save(users);

    const orderer = (qb: SelectQueryBuilder<User>) =>
      qb
        .orderBy(`${userService.entityAliasName}.age`, 'ASC', 'NULLS FIRST')
        .addOrderBy(`${userService.entityAliasName}.id`, 'ASC');

    // 第1页
    const page1 = await userService.findAllCursorPaginated(
      { recordsPerPage: 10 },
      orderer,
    );
    console.log(`Page 1: ${JSON.stringify(page1.data)}`);
    expect(page1.data).toHaveLength(10);
    expect(page1.data.every((u) => u.age === null)).toBe(true);
    expect(page1.nextCursor).toBeDefined();
    expect(page1.previousCursor).toBeUndefined();

    const lastOfPage1 = page1.data[page1.data.length - 1];

    // 第2页
    const page2 = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: page1.nextCursor,
      },
      orderer,
    );
    console.log(`Page 2: ${JSON.stringify(page2.data)}`);
    expect(page2.data).toHaveLength(10);
    expect(page2.previousCursor).toBeDefined();
    expect(page2.nextCursor).toBeDefined();

    const firstOfPage2 = page2.data[0];
    expect(firstOfPage2.id).toBeGreaterThan(lastOfPage1.id); // ✅ 关键校验点

    // 第3页
    const page3 = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: page2.nextCursor,
      },
      orderer,
    );
    console.log(`Page 3: ${JSON.stringify(page3.data)}`);
    expect(page3.data).toHaveLength(10);
    expect(page3.previousCursor).toBeDefined();
    expect(page3.nextCursor).toBeUndefined();

    // ⬅ 回滚到第2页
    const page2Back = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: page3.previousCursor,
      },
      orderer,
    );
    expect(page2Back.data.map((u) => u.id)).toEqual(
      page2.data.map((u) => u.id),
    );
    expect(page2Back.nextCursor).toBe(page2.nextCursor);
    expect(page2Back.previousCursor).toBe(page2.previousCursor);

    // ⬅ 回滚到第1页
    const page1Back = await userService.findAllCursorPaginated(
      {
        recordsPerPage: 10,
        paginationCursor: page2Back.previousCursor,
      },
      orderer,
    );
    expect(page1Back.data.map((u) => u.id)).toEqual(
      page1.data.map((u) => u.id),
    );
    expect(page1Back.nextCursor).toBe(page1.nextCursor);
    expect(page1Back.previousCursor).toBeUndefined();
  });

  it('should work with cursor pagination and relations', async () => {
    const bookService = app.get(BookService);
    expect(bookService).toBeDefined();
    const fiftyUsers = _.range(50).map((i) => {
      const user = new User();
      user.name = `U${i}`;
      user.age = i;
      return user;
    });
    const savedFiftyUsers = await bookService.repo.manager.save(fiftyUsers);

    const hundredBooks = _.range(100).map((i) => {
      const book = new Book();
      book.name = `B${i}`;
      book.userId = savedFiftyUsers[50 - (i % 50) - 1].id;
      return book;
    });

    const savedHundredBooks = await bookService.repo.manager.save(hundredBooks);

    const firstPage = await bookService.findAllCursorPaginated(
      {
        recordsPerPage: 20,
      },
      (qb) =>
        qb
          .orderBy(`user.age`, 'ASC')
          .addOrderBy(`${bookService.entityAliasName}.id`, 'ASC'),
    );

    expect(firstPage.data).toHaveLength(20);
    expect(firstPage.nextCursor).toBeDefined();
    expect(firstPage.previousCursor).toBeUndefined();
    expect(firstPage.data[0].user.age).toBe(0);
    expect(firstPage.data[19].user.age).toBe(9);

    const nextPage = await bookService.findAllCursorPaginated(
      {
        recordsPerPage: 20,
        paginationCursor: firstPage.nextCursor,
      },
      (qb) =>
        qb
          .orderBy(`user.age`, 'ASC')
          .addOrderBy(`${bookService.entityAliasName}.id`, 'ASC'),
    );

    expect(nextPage.data).toHaveLength(20);
    expect(nextPage.nextCursor).toBeDefined();
    expect(nextPage.previousCursor).toBeDefined();
    expect(nextPage.data[0].user.age).toBe(10);
    expect(nextPage.data[19].user.age).toBe(19);

    const backToFirstPageAgain = await bookService.findAllCursorPaginated(
      {
        recordsPerPage: 20,
        paginationCursor: nextPage.previousCursor,
      },
      (qb) =>
        qb
          .orderBy(`user.age`, 'ASC')
          .addOrderBy(`${bookService.entityAliasName}.id`, 'ASC'),
    );

    expect(backToFirstPageAgain.data).toHaveLength(20);
    expect(backToFirstPageAgain.nextCursor).toBe(firstPage.nextCursor);
    expect(backToFirstPageAgain.previousCursor).toBeUndefined();
    expect(backToFirstPageAgain.data[0].user.age).toBe(0);
    expect(backToFirstPageAgain.data[19].user.age).toBe(9);
  });

  it('should not return NotInResult fields', async () => {
    const bookService = app.get(BookService);
    expect(bookService).toBeDefined();

    const book = new Book();
    book.name = 'book1';
    book.tag = 'tag1';
    const savedBook = await bookService.repo.save(book);

    const getBook = await bookService.findOne(savedBook.id);
    expect(getBook.data.name).toBe('book1');
    expect(getBook.data.tag).toBeUndefined();
  });

  it('should work with relations', async () => {
    const bookService = app.get(BookService);
    expect(bookService).toBeDefined();

    const user = new User();
    user.name = 'Yuzu';
    const savedUser = await bookService.repo.manager.save(user);
    const book = new Book();
    book.name = 'book1';
    book.userId = savedUser.id;
    const savedBook = await bookService.repo.manager.save(book);

    const getBook = await bookService.findOne(savedBook.id);

    expect(getBook.data.name).toBe('book1');
    expect(getBook.data.userId).toBe(savedUser.id);

    expect(getBook.data.user).toBeInstanceOf(User);
    expect(getBook.data.user.name).toBe('Yuzu');
  });

  it('should work with query operator', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();

    const users = _.range(20).map((i) => {
      const user = new User();
      user.name = `U${i}`;
      user.age = 20 + i;
      return user;
    });
    const savedUsers = await userService.repo.save(users);

    const getUsers = await userService.findAll(
      {
        ageMoreThan: 25,
        ageLessThan: 30,
      },
      (qb) => qb.orderBy('user.age', 'ASC'),
    );

    // 26-29
    expect(getUsers.data).toHaveLength(4);
    expect(getUsers.data[0].age).toBe(26);
    expect(getUsers.data[3].age).toBe(29);
  });

  const testHttpServer = async (path: string) => {
    const server = await app.getHttpServer();
    const badDate = new Date(0x3f3f3f3f);
    await request(server)
      .post(`/${path}`)
      .send({ name: 'Yuzu', age: 20, gender: 'F', createdAt: badDate })
      .expect(200);
    await request(server)
      .get(`/${path}/1`)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
          id: 1,
          name: 'Yuzu',
          age: 20,
          gender: 'F',
        });
        // createdAt should not be the badDate
        const createdAt = new Date(res.body.data.createdAt);
        expect(createdAt.getTime()).not.toEqual(badDate.getTime());
      });
    await request(server)
      .get(`/${path}?name=Yuzu`)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data[0]).toMatchObject({
          id: 1,
          name: 'Yuzu',
          age: 20,
          gender: 'F',
        });
      });
    await request(server)
      .get(`/${path}?name=Yume`)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(0);
      });

    await request(server)
      .get(`/${path}?ageIn=20,21`)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
      });
    await request(server)
      .get(`/${path}?ageIn=22,23`)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(0);
      });

    await request(server)
      .patch(`/${path}/1`)
      .send({ name: 'Nana', gender: 'M' })
      .expect(200);
    await request(server)
      .get(`/${path}/1`)
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
          id: 1,
          name: 'Nana',
          age: 20,
          gender: 'F', // gender is not updated because it's NotChangeable
        });
      });

    await request(server).delete(`/${path}/1`).expect(200);
    await request(server).get(`/${path}/1`).expect(404);
    await request(server)
      .post(`/${path}/import`)
      .send({
        data: [
          {
            name: 'Hana',
            age: 19,
            gender: 'F',
          },
          {
            name: 'Miko',
            age: 20,
            gender: 'F',
          },
        ],
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].entry.name).toBe('Hana');
        expect(res.body.data[0].entry.age).toBe(19);
        expect(res.body.data[1].entry.name).toBe('Miko');
        expect(res.body.data[1].entry.age).toBe(20);
      });
    await request(server)
      .get(`/${path}?name=Hana`)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].name).toBe('Hana');
        expect(res.body.data[0].age).toBe(19);
      });
    await request(server)
      .get(`/${path}?name=Miko`)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].name).toBe('Miko');
        expect(res.body.data[0].age).toBe(20);
      });
  };

  it('should work with controller', async () => {
    await testHttpServer('user');
  });

  it('should work with controller (generated)', async () => {
    await testHttpServer('user2');
  });

  it('should work with controller (generated single file)', async () => {
    await testHttpServer('user3');
  });

  it('should generate openapi correctly', async () => {
    const server = await app.getHttpServer();
    await request(server)
      .get('/docs-json')
      .expect(200)
      .expect((res) => {
        // console.log(`OpenAPI JSON: ${JSON.stringify(res.body, null, 2)}`);
        expect(res.body).toBeDefined();
        const checkController = (cls: any, path: string) => {
          const createMethod = `/${path}`;
          const findAllMethod = `/${path}`;
          const findOneMethod = `/${path}/{id}`;
          const updateMethod = `/${path}/{id}`;
          const deleteMethod = `/${path}/{id}`;
          const importMethod = `/${path}/import`;
          const checks = [
            { name: 'create', method: 'post', path: createMethod },
            { name: 'findAll', method: 'get', path: findAllMethod },
            { name: 'findOne', method: 'get', path: findOneMethod },
            { name: 'update', method: 'patch', path: updateMethod },
            { name: 'delete', method: 'delete', path: deleteMethod },
            { name: 'import', method: 'post', path: importMethod },
          ];
          checks.forEach((check) => {
            const operation = res.body.paths[check.path]?.[check.method];
            expect(operation).toBeDefined();
            expect(operation.operationId).toBe(cls.name + '_' + check.name);
          });
        };
        checkController(UserController, 'user');
        checkController(UserController2, 'user2');
        checkController(SingleUserController, 'user3');
      });
  });
});
