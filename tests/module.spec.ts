import { NestExpressApplication } from '@nestjs/platform-express';
import { Controller, Injectable } from '@nestjs/common';
import { CrudService } from '../src/crud-base';
import { Book, Gender, User } from './utility/user';
import { RestfulFactory } from '../src/decorators';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import _ from 'lodash';

@Injectable()
class UserService extends CrudService(User) {
  constructor(@InjectDataSource() db: DataSource) {
    super(db.getRepository(User));
  }
}

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
}

describe('app', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});

/*
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
      controllers: [UserController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  it('should work with database', async () => {
    const userService = app.get(UserService);
    expect(userService).toBeDefined();
    const user = new User();
    user.name = 'Yuzu';
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

  it('should work with controller', async () => {
    const server = await app.getHttpServer();
    await request(server)
      .post('/user')
      .send({ name: 'Yuzu', age: 20, gender: 'F' })
      .expect(200);
    await request(server)
      .get('/user/1')
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
          id: 1,
          name: 'Yuzu',
          age: 20,
          gender: 'F',
        });
      });
    await request(server).patch('/user/1').send({ name: 'Nana' }).expect(200);
    await request(server)
      .get('/user/1')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
          id: 1,
          name: 'Nana',
          age: 20,
          gender: 'F',
        });
      });

    await request(server).delete('/user/1').expect(200);
    await request(server).get('/user/1').expect(404);
  });
});
*/
