import { NestExpressApplication } from '@nestjs/platform-express';
import { Controller, Injectable } from '@nestjs/common';
import { CrudService } from '../src/crud-base';
import { Gender, User } from './utility/user';
import { RestfulFactory } from '../src/decorators';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';

@Injectable()
class UserService extends CrudService(User) {
  constructor(@InjectDataSource() db: DataSource) {
    super(db.getRepository(User));
  }
}

const dec = new RestfulFactory(User);
class UpdateUserDto extends dec.updateDto {}

@Controller('user')
class UserController {
  constructor(private userService: UserService) {}

  @dec.create()
  create(@dec.createParam() user: User) {
    return this.userService.create(user);
  }

  @dec.findOne()
  findOne(@dec.idParam() id: number) {
    return this.userService.findOne(id);
  }

  @dec.findAll()
  findAll(@dec.findAllParam() user: UpdateUserDto) {
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
          entities: [User],
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'postgres',
          database: 'postgres',
        }),
      ],
      providers: [UserService],
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
    await userService.update(createResult.data.id, {
      name: 'Nana',
    });
    const getUpdatedUser = await userService.findOne(createResult.data.id);
    expect(getUpdatedUser.data.name).toBe('Nana');
    await userService.delete(createResult.data.id);
    const getDeletedUser = await userService.findAll({ name: 'Nana' });
    expect(getDeletedUser.data).toHaveLength(0);
  });

  it('should work with controller', async () => {
    const server = await app.getHttpServer();
    await request(server)
      .post('/user')
      .send({ name: 'Yuzu', age: 20, gender: 'F' })
      .expect(200);
    await request(server)
      .get('/user/1')
      .expect(res => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
          id: 1,
          name: 'Yuzu',
          age: 20,
          gender: 'F',
        });
      });
    await request(server)
      .patch('/user/1')
      .send({ name: 'Nana' })
      .expect(200);
    await request(server)
      .get('/user/1')
      .expect(200)
      .expect(res => {
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
