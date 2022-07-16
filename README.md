# nicot

Nest.js interacting with class-validator + OpenAPI + TypeORM for Nest.js Restful API development.

## Install

In your Nest.js project, run the following command:

```bash
npm install @nestjs/swagger typeorm @nestjs/typeorm class-validator class-transformer nicot
```

## Entity

Those decorators would all decorate the following, with the SAME settings.

- TypeORM `@Entity()` settings.
- class-validator validation settings.
- `@nestjs/swagger` `@ApiProperty()` settings.

```ts
@Entity()
export class User extends IdBase() {
  @Index()
  @StringColumn(5, {
    required: true,
    description: 'User name',
  })
  name: string;

  @IntColumn('int', { unsigned: true, description: 'User age', default: 20 })
  age: number;

  @EnumColumn(Gender, { description: 'User gender' })
  gender: Gender;
  
  @NotColumn()
  somethingElse: any; // Would not come from client input, and would not go into OpenAPI document.
}
```

There are also other following decorators to control accessibility:

- `@NotWritable()` Can only come from GET requests.
- `@NotChangeable()` Cannot be changed by PATCH requests.

## CrudService

Creates a service for database operation in one word.

```ts
@Injectable()
export class UserService extends CrudService(User) {
  constructor(@InjectDataSource() db: DataSource) {
    super(db.getRepository(User));
  }
}
```

## Controller decorators

Would also register proper OpenAPI documentation for the controller.

```ts
const dec = new RestfulFactory(User);
class UpdateUserDto extends dec.updateDto {} // to extract type and class

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @dec.create() // POST /
  create(@dec.createParam() user: User) {
    return this.userService.create(user);
  }

  @dec.findOne() // GET /:id
  findOne(@dec.idParam() id: number) {
    return this.userService.findOne(id);
  }

  @dec.findAll() // GET /
  findAll(@dec.findAllParam() user: UpdateUserDto) {
    return this.userService.findAll(user);
  }

  @dec.update() // PATH /:id
  update(@dec.idParam() id: number, @dec.updateParam() user: UpdateUserDto) {
    return this.userService.update(id, user);
  }

  @dec.delete() // DELETE /:id
  delete(@dec.idParam() id: number) {
    return this.userService.delete(id);
  }
}
```

## Return message

Return data of all APIs are in the following format, with proper OpenAPI documentation: 

```ts
export interface ReturnMessage<T> {
  statusCode: number;
  message: string;
  success: boolean;
  data: T;
}
```

You may also create a Dto class like this by the following way:

```ts
export class UserReturnMessage extends ReturnMessageDto(User) {}
```

With result into the following class, also with proper OpenAPI documentation:

```ts
export class UserReturnMessage {
  statusCode: number;
  message: string;
  success: boolean;
  data: User;
}
```
