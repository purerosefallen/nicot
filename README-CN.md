# NICOT — Entity-Driven REST Framework for NestJS + TypeORM

**N**estJS · **I** (nesties) · **C**lass-validator · **O**penAPI · **T**ypeORM  
（记法：nicotto / nicotine —— 用了就上头 😌）

NICOT 是一个 *Entity-Driven* 的全自动 REST 后端框架。

> **维护实体 = 自动得到 DTO、验证规则、分页、过滤器、Controller、Service、OpenAPI。**

核心理念：

- 默认关闭，一切需显式开启（whitelist-only）。  
- 实体就是契约（Entity = Schema）。  
- 点状扩展（AOP-like hooks），不发明 DSL。  
- 保持 NestJS 味道，避免“被框架绑架”。

---

## 快速示例

```ts
@Entity()
export class User extends IdBase() {
  @StringColumn(255, { required: true })
  @QueryEqual()
  name: string;

  @IntColumn('int')
  age: number;

  @StringColumn(255)
  @NotInResult()
  password: string;

  @NotWritable()
  createdAt: Date;
}
```

```ts
const UserFactory = new RestfulFactory(User);

@Injectable()
export class UserService extends UserFactory.crudService() {
  constructor(@InjectRepository(User) repo) {
    super(repo);
  }
}

@Controller('users')
export class UserController extends UserFactory.baseController() {
  constructor(service: UserService) {
    super(service);
  }
}
```

---

## 特性摘要

- 自动生成 DTO（Create / Update / Find / CursorFind / Result）。  
- 自动生成 Controller + Service。  
- 白名单式字段权限：可写、可查、可返回分别控制。  
- 自动分页（页码 / 游标）。  
- 轻量查询 DSL（QueryCondition）。  
- MutatorPipe：URL 字符串 → 实际类型。  
- 生命周期钩子（validate、beforeGet、afterCreate...）。  

---

## IdBase / StringIdBase

### IdBase()

- bigint 自增主键（unsigned）  
- 默认排序：id DESC  
- 自动挂载：NotWritable、QueryEqual

```ts
@Entity()
class User extends IdBase() {}
```

### StringIdBase()

- 字符串主键  
- 默认排序：id ASC  
- 支持 uuid: true 自动生成

```ts
@Entity()
class Token extends StringIdBase({ uuid: true }) {}
```

---

## 访问权限装饰器（字段级“能看 / 能写 / 能查”）

NICOT 用一组装饰器，把“这个字段在什么场景出现”讲清楚：

- 写入相关：Create / Update 请求体里有没有这个字段  
- 查询相关：GET 查询参数里能不能用这个字段  
- 返回相关：响应 JSON 里有没有这个字段  
- 数据库相关：是不是实际的列

常用装饰器：

| 装饰器        | Create DTO | Update DTO | Query DTO | Result DTO | 数据库列 |
|---------------|-----------|-----------|----------|-----------|---------|
| NotWritable   | ❌        | ❌        | —        | ✔ / ❌ 取决于 NotInResult | ✔ |
| NotCreatable  | ❌        | ✔         | —        | ✔ / ❌   | ✔ |
| NotChangeable | ✔         | ❌        | —        | ✔ / ❌   | ✔ |
| NotQueryable  | ✔         | ✔         | ❌       | ✔ / ❌   | ✔ |
| NotInResult   | ✔         | ✔         | ✔        | ❌       | ✔ |
| NotColumn     | ❌        | ❌        | ❌       | ❌       | ✖（仅运行时字段） |

一个典型例子：

```ts
class User extends IdBase() {
  @StringColumn(255, { description: '登录邮箱' })
  @NotInResult()
  @NotWritable()
  email: string;          // 库里有，接口永不返回，也不能写

  @StringColumn(255)
  @NotInResult()
  password: string;       // 密码永远不出现在任何返回里

  @DateColumn()
  @NotWritable()
  createdAt: Date;        // 只读字段：只出现在返回，不能在 Create/Update 中写

  @NotColumn()
  profileCompleted: boolean; // 运行时计算字段（afterGet 里赋值），不落库
}
```

访问控制的核心思路：

- 敏感字段一开始就挂上 NotInResult + NotWritable。  
- 不在外部写的字段，用 NotCreatable / NotChangeable 精确限制。  
- 只在内部使用的临时字段，用 NotColumn 标记，避免误入 DTO / 返回 / 查询。

---

## 查询系统：QueryCondition

只要字段想被 GET 查询使用，就必须显式声明。

```ts
@QueryLike()
name: string;

@QueryIn()
tags: string[];

@QueryGreater()
age: number;

@QueryFullText({ parser: 'zhparser', orderBySimilarity: true })
content: string;
```

常见条件：

| 装饰器              | 描述                  |
|---------------------|-----------------------|
| QueryEqual          | 精确匹配              |
| QueryLike           | 前缀 LIKE             |
| QuerySearch         | 包含 LIKE             |
| QueryGreater/Less   | 数值比较              |
| QueryIn / QueryNotIn| IN / NOT IN           |
| QueryMatchBoolean   | 自动解析 true/false   |
| QueryOperator       | 自定义操作符          |
| QueryWrap           | 自定义表达式          |
| QueryAnd / QueryOr  | 条件组合              |
| QueryFullText       | PostgreSQL 全文搜索   |

---

## GET Mutator（URL → 类型转换）

URL 参数永远是 string。  
MutatorPipe 用于把字符串转换成真正的运行时类型。

```ts
@GetMutatorInt()
@QueryEqual()
score: number;  // ?score=123 → number 123

@GetMutatorJson()
@QueryOperator('@>')
meta: SomeJSONType; // ?meta={"foo":"bar"} → 对象
```

在 OpenAPI 里，这些字段仍以 string 展示；在实际运行时，它们已经被转换为你想要的类型。

---

## Relations 与 @RelationComputed

NICOT 的关系配置出现在两个层面，各自含义不同：

- RestfulFactory.relations：  
  控制生成的 Result DTO 中“哪些关系字段会被返回”。

- CrudService.relations：  
  控制 SQL 层面会 join 哪些关系。

推荐做法：

- 单独建一个 xxx.factory.ts，把这两个地方都统一配置好。  
- Service 用 factory.crudService()。  
- Controller 用 factory.baseController()。  

```ts
// user.entity.ts
@Entity()
export class User extends IdBase() {
  @OneToMany(() => Article, article => article.user)
  articles: Article[];
}

// user.factory.ts
export const UserFactory = new RestfulFactory(User, {
  relations: ['articles'],
});

// user.service.ts
@Injectable()
export class UserService extends UserFactory.crudService() {
  constructor(@InjectRepository(User) repo) {
    super(repo);
  }
}

// user.controller.ts
@Controller('users')
export class UserController extends UserFactory.baseController() {
  constructor(userService: UserService) {
    super(userService);
  }
}
```

这样：

- DTO 中会包含 articles 字段。  
- 查询时会自动 left join user.articles。  
- 不需要自己维护多份 relations 配置。

### @RelationComputed：标记“由关系推导出的 NotColumn 字段”

有些字段本身不落库（NotColumn），但它是由若干关系字段组合出来的，并且你希望它可以：

- 出现在 Result DTO 中，  
- 同时不把整棵关联树一路无限展开。

这种场景使用 @RelationComputed。

```ts
@Entity()
export class Participant extends IdBase() {
  @OneToMany(() => Match, m => m.player1)
  matches1: Match[];

  @OneToMany(() => Match, m => m.player2)
  matches2: Match[];
}

@Entity()
export class Match extends IdBase() {
  @ManyToOne(() => Participant, p => p.matches1)
  player1: Participant;

  @ManyToOne(() => Participant, p => p.matches2)
  player2: Participant;

  @NotColumn()
  @RelationComputed(() => Participant)
  players: Participant[];

  async afterGet() {
    this.players = [this.player1, this.player2].filter(Boolean);
  }
}
```

```ts
// match.factory.ts
export const MatchFactory = new RestfulFactory(Match, {
  relations: ['player1', 'player2', 'players'],
});
```

作用可以简单理解为：

- players 虽然是 NotColumn，但被当成“关系节点”参与 relations 剪裁。  
- DTO 会包含 player1 / player2 / players 三个字段。  
- 但不会因为 players 是 Participant[] 就把 participants 的所有反向关系再展开一遍。  

总结一下关系相关的最佳实践：

- 真正的 @ManyToOne / @OneToMany 一律在 entity 上写清楚。  
- 所有对外需要返回的关系字段，集中在 xxx.factory.ts 的 relations 里配置。  
- 复杂组合 / 聚合字段（NotColumn）用 @RelationComputed 标记依赖类型，再加到 relations 里。

---

## `skipNonQueryableFields`: 只暴露你显式声明的查询字段

默认情况下，`findAllDto` 会包含：

- `PageSettingsDto` 的分页字段（`pageCount`, `recordsPerPage`）  
- 实体中**没有被** `NotQueryable` / `NotColumn` / 必须 GetMutator 但未配置的字段剔除掉的剩余字段  

也就是说，只要没被标成“禁止查询”，理论上 GET DTO 里就能看到它。

如果你希望 **GET 查询参数只允许那些显式挂了 `@QueryEqual()` / `@QueryLike()` 等查询装饰器的字段**，可以开启：

```ts
const UserFactory = new RestfulFactory(User, {
  relations: [],
  skipNonQueryableFields: true,
});
```

开启后行为变成：

- `findAllDto` 中**仅保留**挂了 QueryCondition 系列装饰器的字段：
  - `@QueryEqual`
  - `@QueryLike`
  - `@QueryIn`
  - `@QueryFullText`
  - 等所有基于 `QueryCondition` 的装饰器  
- 其他普通字段（即使没被 `NotQueryable` 标记）**不会**出现在 GET DTO 里，也不会出现在 Swagger 的查询参数中。  
- `findAllParam()` 在运行时会额外套一层 `PickPipe(this.queryableFields)`，把 query 里的无关字段都剔掉，达到“白名单”效果。

简单理解：

> 不挂 `@QueryXXX` 就完全不能在 GET /list 上当查询条件用，连 OpenAPI 文档都看不到。

这在下面几种场景特别好用：

- 你想让前端“按字段提示”来写查询，而不是随便往 URL 里塞东西。  
- 实体字段特别多，只想开放少量查询条件，避免 Swagger 里出现一长串 query 参数。  
- 把“能不能被查”这件事集中收敛到实体上的 `@QueryXXX()` 装饰器，读代码一眼就知道有哪些查询入口。

配合方式：

- 想允许查询：在字段上挂 `@QueryEqual` / `@QueryLike` / `@QueryIn` 等。  
- 不想允许查询：什么都不挂（或者明确 `@NotQueryable`）。  
- 想缩小 GET DTO：在对应 `RestfulFactory` 上加 `skipNonQueryableFields: true`。  

推荐实践是：

- **后台管理接口**：几乎都开 `skipNonQueryableFields: true`，强制前后端只围绕“显式查询字段”合作。  
- **内部工具 / 临时调试接口**：可以保持默认行为，不开这个选项，方便随手查数据。


---

## 自动生成的 DTO

通过 RestfulFactory，你可以直接拿到一堆已经裁剪好的 DTO 类型，例如：

- createDto / updateDto  
- findAllDto（含分页字段）  
- findAllCursorPaginatedDto（游标分页）  
- entityResultDto（按 NotInResult / relations 剪裁字段）  
- entityCreateResultDto（创建时返回的精简版本）  
- entityReturnMessageDto / entityArrayReturnMessageDto / entityCursorPaginationReturnMessageDto  

使用方式类似：

```ts
const UserFactory = new RestfulFactory(User, { relations: ['articles'] });

export class CreateUserDto extends UserFactory.createDto {}
export class UpdateUserDto extends UserFactory.updateDto {}
export class FindAllUserDto extends UserFactory.findAllDto {}
export class UserResultDto extends UserFactory.entityResultDto {}
```

你可以在手写 Controller 时直接复用这些 DTO。

---

## 分页系统

### 页码分页（默认）

```ts
GET /users?pageCount=1&recordsPerPage=25
```

如需修改默认 page size，可以在实体中 override PageSettings 相关方法（例如）：

```ts
@Entity()
class Log extends IdBase() {
  override getRecordsPerPage() {
    return this.recordsPerPage || 1000;
  }
}
```

### 游标分页

支持：

- 多字段排序  
- next/prev 双向翻页  
- 基于 Base64URL 的 cursor payload  

算法较复杂，只在 api.md 里详细展开。  
在 README 里你只需要记得：**这是适合时间线 / 无限滚动的分页模式**。

---

## 生命周期钩子

实体可以实现以下方法来参与 CRUD 生命周期：

```ts
class User extends IdBase() {
  async beforeCreate() {}
  async afterCreate() {}

  async beforeGet() {}
  async afterGet() {}

  async beforeUpdate() {}
  async afterUpdate() {}

  isValidInCreate(): string | undefined {
    if (!this.name) return 'name is required';
  }

  isValidInUpdate(): string | undefined {
    if (this.age != null && this.age < 0) return 'age must be >= 0';
  }
}
```

- isValidInCreate / isValidInUpdate：返回字符串 → 400 错误。  
- beforeXxx / afterXxx：可以做补全、审计、统计等逻辑。  

---

## 手写 Controller（高级用法）

“手写”不是完全放弃工厂，而是 **继续用 RestfulFactory 的装饰器和 DTO**，在方法实现里插入你自己的业务逻辑。

下面是一个示例：基于当前登录用户做数据隔离。  
其中 `@PutUser()` 是你项目里的业务装饰器（和 NICOT 无关），负责注入当前用户。

```ts
// post.factory.ts
export const PostFactory = new RestfulFactory(Post, {
  relations: [], // 明确这里不加载任何关系
});

// post.service.ts
@Injectable()
export class PostService extends PostFactory.crudService() {
  constructor(@InjectRepository(Post) repo: Repository<Post>) {
    super(repo);
  }
}

// post.controller.ts
import { Controller } from '@nestjs/common';
import { PutUser } from '../common/put-user.decorator';

// 在 controller 外面把 DTO 固定成具名类，方便引用 / 推导
export class FindAllPostDto extends PostFactory.findAllDto {}
export class CreatePostDto extends PostFactory.createDto {}

@Controller('posts')
export class PostController {
  constructor(private readonly service: PostService) {}

  @PostFactory.findAll()
  async findAll(
    @PostFactory.findAllParam() dto: FindAllPostDto,
    @PutUser() user: User,
  ) {
    return this.service.findAll(dto, qb => {
      qb.andWhere('post.userId = :uid', { uid: user.id });
    });
  }

  @PostFactory.create()
  async create(
    @PostFactory.createParam() dto: CreatePostDto,
    @PutUser() user: User,
  ) {
    dto.userId = user.id;
    return this.service.create(dto);
  }
}
```

要点是：

- 路由装饰器仍然来自 PostFactory（保证 DTO / Swagger / 返回结构一致）。  
- 参数装饰器也来自 PostFactory（自动 ValidationPipe / MutatorPipe / OmitPipe 等）。  
- 你只在方法体内做“多一步”：  
  - 把 user.id 写进 dto。  
  - 对 QueryBuilder 追加额外 where 条件。  

如果你完全绕开 CrudService / RestfulFactory（例如直接 repo.find），那就等于跳出 NICOT 的生命周期系统，需要自己保证安全性与一致性。

---

## 装饰器行为矩阵（整体优先级视角）

| 装饰器              | Create DTO | Update DTO | Query DTO | Result DTO |
|---------------------|-----------|-----------|----------|-----------|
| NotWritable         | ❌        | ❌        | —        | — |
| NotCreatable        | ❌        | ✔         | —        | — |
| NotChangeable       | ✔         | ❌        | —        | — |
| NotQueryable        | ✔         | ✔         | ❌       | ✔ |
| NotInResult         | ✔         | ✔         | ✔        | ❌ |
| NotColumn           | ❌        | ❌        | ❌       | ❌ |
| QueryCondition 系列 | —         | —         | ✔       | — |
| GetMutator          | —         | —         | ✔（string→类型） | — |

可以把这张表理解成：  
“如果出现冲突，以更‘收紧’的装饰器为准”。

---

## 安装

```bash
npm install nicot typeorm @nestjs/typeorm class-validator class-transformer reflect-metadata @nestjs/swagger
```

---

## 设计哲学（Philosophy）

### 1. Entity = Contract  
避免重复维护 schema / DTO / API，所有行为围绕实体展开。

### 2. Whitelist-only  
字段要能写、能查、能返回，都必须显式声明。  
没有“默认全部暴露”的行为。

### 3. 不发明 DSL  
依赖 TypeScript 装饰器而不是额外 DSL / YAML。  
你看到的就是 TypeScript 代码本身。

### 4. 自动化不隐藏逻辑  
CRUD 可以一键生成，但 QueryCondition、MutatorPipe、hooks、extraQuery 都是显式可见的扩展点。

---

## LICENSE

MIT
