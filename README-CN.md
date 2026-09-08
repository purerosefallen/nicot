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

## 测试

当前测试默认连接本机 PostgreSQL：

- 地址：`localhost:5432`
- 用户名：`postgres`
- 密码：`postgres`
- 数据库：`postgres`

可以直接用项目内的测试 compose 启动：

```bash
docker compose -f tests/docker-compose.yml up -d
```

由于 `tests/fulltext.spec.ts` 会使用 `@QueryFullText({ parser: 'zhparser' })`，这里不是普通 `postgres` 镜像，而是带 `zhparser` 扩展的 `zhparser/zhparser:bookworm-16`。

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

`IdBase()` 会创建 `bigint` 自增数字主键，并自动应用 `NotWritable`、
`QueryEqual` 和默认的 `id DESC` 排序。`StringIdBase()` 创建字符串主键；
`uuid: true` 时由数据库生成 UUID，否则由客户端提供字符串 ID，并默认按
`id ASC` 排序。两者都可通过 `noOrderById: true` 关闭默认排序。

---

## Column 装饰器概览

NICOT 的 `***Column()` 装饰器会同时组合 TypeORM 列定义、class-validator
验证规则与 Swagger `ApiProperty` metadata：

| 装饰器 | 默认数据库类型 | 默认验证 |
| --- | --- | --- |
| `@StringColumn(len)` | `varchar(len)` | `IsString`、`Length` |
| `@TextColumn()` | `text` | `IsString` |
| `@UuidColumn()` | `uuid` | `IsUUID` |
| `@IntColumn(type)` | 整数类型 | `IsInt` |
| `@FloatColumn(type)` | 浮点或 decimal | `IsNumber` |
| `@BoolColumn()` | `boolean` | `IsBoolean` |
| `@DateColumn()` | timestamp/date | `IsDate` |
| `@JsonColumn(T)` | `jsonb` | 对象及嵌套验证 |
| `@SimpleJsonColumn()` | `json` | 对象及嵌套验证 |
| `@StringJsonColumn()` | 文本 JSON | 对象及嵌套验证 |
| `@EnumColumn(Enum)` | enum/text | enum 验证 |
| `@Base64BinaryColumn()` | `bytea` | base64 字符串或二进制 |

所有列装饰器都可通过 options 同时声明接口约束：

```ts
@StringColumn(255, {
  required: true,
  description: '显示名称',
  default: 'Anonymous',
})
displayName: string;
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
| QueryBase64Equal / QueryBase64NotEqual | base64 字符串解码为二进制后比较（配合 `@Base64BinaryColumn()`） |
| QueryOperator       | 自定义操作符          |
| QueryWrap           | 自定义表达式          |
| QueryAnd / QueryOr  | 条件组合              |
| QueryFullText       | PostgreSQL 全文搜索   |

### `findAll()` / `findAllCursorPaginated()` 查询生命周期

调用 `CrudBase.findAll(dto)` 时，NICOT 会：

1. 创建实体实例并复制 DTO。
2. 调用实体的 `beforeGet()`。
3. 调用 `entity.applyQuery(qb, alias)`，例如 `IdBase` 在这里添加默认排序。
4. 应用 `relations` 配置的 join。
5. 依次运行字段上的 `QueryCondition`，修改 `SelectQueryBuilder`。

因此 `@QueryXXX()` 本质上是声明式的查询构造 hook。除上表外，还支持
`QueryGreaterEqual`、`QueryLessEqual`、`QueryNotEqual`、
`QueryEqualZeroNullable` 和 PostgreSQL `QueryJsonbHas`。

### QueryAnd / QueryOr 组合条件

`QueryAnd(A, B)` 会在同一字段上同时应用两个条件；`QueryOr(A, B)` 会生成
带括号的 `(A) OR (B)` 条件组，适合多列搜索或 fallback 查询：

```ts
@QueryOr(QueryIn('name'), QueryEqual('bio'))
search: string;
```

### PostgreSQL 全文搜索

```ts
@StringColumn(255)
@QueryFullText({
  configuration: 'english',
  tsQueryFunction: 'websearch_to_tsquery',
  orderBySimilarity: true,
})
content: string;
```

模块初始化时会准备需要的全文配置与索引；查询时生成
`to_tsvector(...) @@ websearch_to_tsquery(...)`，并可按 rank 排序。该能力只
支持 PostgreSQL。

---

## Base64 二进制列：`@Base64BinaryColumn()`

`@Base64BinaryColumn()` 让你在**数据库里存原始二进制**，而在 实体 / DTO /
OpenAPI 层面统统“伪装成”一个普通的 base64 `string` 字段：

- 实体属性类型是 `string`（base64 字符串）。
- OpenAPI 中以 `{ type: String, format: 'byte' }` 展示。
- 通过 TypeORM `ValueTransformer`：写库时把 base64 字符串解码成
  PostgreSQL 安全的 bytea 参数（默认列类型 `bytea`），读取时再编码回
  base64 字符串。

```ts
@Entity()
export class Attachment extends IdBase() {
  @Base64BinaryColumn({ required: true })
  data: string; // 接口里是 base64，PostgreSQL 里是 bytea

  // MySQL 可指定 blob 系列类型：
  @Base64BinaryColumn({ columnType: 'longblob' })
  thumbnail: string;
}
```

**直接赋二进制也合法。** 虽然类型是 base64 `string`，但如果在你自己的代码里
（例如 `repo.save`）直接赋了 `Buffer` / `Uint8Array` / `ArrayBuffer`，会被认为
“这就是那段二进制”原样入库，校验同样通过；读出来时依然是 base64 字符串。

**查询。** base64 二进制列本身就是可查询字段（不需要 `GetMutator`）。想在
`findAll` 中按它过滤，给它挂上 `@QueryBase64Equal()`（或
`@QueryBase64NotEqual()`）即可：传入的 base64 查询串会在绑定参数前被解码成
PostgreSQL 安全的 bytea 参数，从而与列里存的二进制匹配。

```ts
@Base64BinaryColumn()
@QueryBase64Equal()
signature: string; // GET /attachment?signature=3q2+7w==
```

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

运行流程是：Swagger 将字段描述成适合 URL 的字符串，`MutatorPipe` 在运行时
调用字段上的 mutator，Controller 最终收到转换后的 DTO。内置 helper 包括：

- `GetMutatorBool`
- `GetMutatorInt` / `GetMutatorFloat`
- `GetMutatorStringSeparated`
- `GetMutatorIntSeparated` / `GetMutatorFloatSeparated`
- `GetMutatorJson`

`RestfulFactory.findAllParam()` 会自动组合 `MutatorPipe`、用于移除禁止查询字段的
`OmitPipe`，以及开启 `skipNonQueryableFields` 时的 `PickPipe`。

---

## 🔐 Binding Context（数据绑定 / 多租户隔离）

在实际的业务系统中，后端经常需要根据“当前用户 / 当前租户 / 当前 App”等上下文，对数据进行自动隔离：

- 一个用户只能看到自己的数据
- 不同 App 的数据不能相互越界
- 更新 / 删除操作必须自动附带权限条件
- 不希望每个 Controller/Service 都写重复的 `qb.andWhere(...)`

NICOT 提供了 **BindingColumn / BindingValue / useBinding / beforeSuper / RequestScope Provider**，  
让多租户隔离变成 **实体级声明**，和 DTO / Query / Lifecycle 保持一致。

---

### 1. BindingColumn — 声明“这个字段必须被绑定”

当某个字段的值应该由后端上下文（而不是前端请求）决定时，应使用 `@BindingColumn`。

示例：

```ts
@Entity()
class Article extends IdBase() {
  @BindingColumn()        // 默认 bindingKey: "default"
  @IntColumn('int')
  userId: number;
  
  @BindingColumn('app')   // bindingKey: "app"
  @IntColumn('int')
  appId: number;
}
```

含义：

- **Create**：NICOT 会自动写入绑定值，无需前端提供
- **FindAll**：NICOT 会自动在 WHERE 中加入 userId/appId 条件
- **Update/Delete**：NICOT 会自动加上绑定条件，防止越权修改
- 这是“多租户字段”或“业务隔离字段”的最直接声明方式

这样做的好处：

- 权限隔离逻辑不会散落在 controller/service 里
- Entity = Contract → 数据隔离是实体的一部分
- 自动生成的控制器天然具备隔离能力

---

### 2. BindingValue — 绑定值的来源（Service 层）

BindingColumn 声明了“需要绑定的字段”，  
BindingValue 声明“绑定值从哪里来”。

示例：

```ts
@Injectable()
class ArticleService extends CrudService(Article) {
  @BindingValue()   // 对应 BindingColumn()
  get currentUserId() {
    return this.ctx.userId;
  }
  
  @BindingValue('app')
  get currentAppId() {
    return this.ctx.appId;
  }
}
```

BindingValue 可以定义成：

- 方法（NICOT 会自动调用）
- getter 属性

它们会在 CRUD pre-phase 被收集成：

- create：强制写入字段
- findAll/update/delete：用于 WHERE 条件

优先级高于前端传入值。

---

### 3. useBinding — 本次调用临时覆盖绑定值

适合：

- 测试
- CLI 脚本
- 内部批处理任务
- 覆盖默认绑定行为

示例：

```ts
service
  .useBinding(7)           // 覆盖 bindingKey = default
  .useBinding(44, 'app')   // 覆盖 bindingKey = "app"
  .findAll({});
```

特点：

- 覆盖值仅对当前一次方法调用有效
- 不影响同一 service 的其他并发请求
- 可与 BindingValue 合并
- 可用于 request-scope provider 不存在时的替代方案

---

### 4. beforeSuper — Override 场景的并发安全机制（高级用法）

如果你 override `findAll` / `update` / `delete` 并插入 `await`，  
可能打乱绑定上下文的使用时序（因为 Service 是 singleton）。

NICOT 提供 `beforeSuper` 方法，确保绑定上下文在 override 内不会被并发污染：

```ts
override async findAll(...args) {
  await this.beforeSuper(async () => {
    await doSomethingSlow();
  });
  return super.findAll(...args);
}
```

机制：

1. freeze 当前 binding 上下文
2. 执行 override 的 async 逻辑
3. restore binding
4. 再交给 CrudBase 做正式的 CRUD 处理

这是一个高级能力，不是普通用户需要接触的 API。

---

### 5. Request-scope Provider（推荐的绑定来源模式）

推荐使用 NestJS 的 request-scope provider 自动提供绑定上下文。  
绑定值自然来自当前 HTTP 请求：

- userId 来自认证信息
- appId 来自 header
- tenantId 来自域名
- ……

#### 5.1 使用 `createProvider` 构造 request-scope binding provider

```ts
export const BindingContextProvider = createProvider(
  {
    provide: 'BindingContext',
    scope: Scope.REQUEST,                 // ⭐ 每个请求一份独立上下文
    inject: [REQUEST, AuthService] as const,
  },
  async (req, auth) => {
    const user = await auth.getUserFromRequest(req);
    return {
      userId: user.id,
      appId: Number(req.headers['x-app-id']),
    };
  },
);
```

`createProvider` 会自动推断 `(req, auth)` 的类型。

#### 5.2 在 Service 中注入 BindingContext

```ts
@Injectable()
class ArticleService extends CrudService(Article) {
  constructor(
    @Inject('BindingContext')
    private readonly ctx: { userId: number; appId: number },
  ) {
    super(repo);
  }
  
  @BindingValue()
  get currentUserId() {
    return this.ctx.userId;
  }
  
  @BindingValue('app')
  get currentAppId() {
    return this.ctx.appId;
  }
}
```

效果：

- Service 仍然可以是 singleton
- BindingValue 一律从 per-request binding context 读取
- 完全并发安全

这是 NICOT 官方推荐的绑定方式。

---

### 6. Binding 工作流程（流程概览）

1. 用户调用 Service（可能使用 `useBinding` 覆盖）
2. CrudBase pre-phase：收集所有 BindingValue
3. 合并 request-scope provider / useBinding / 默认值
4. 构造 PartialEntity（绑定字段 → 绑定值）
5. create：强制写入字段
6. findAll/update/delete：自动注入 WHERE 条件
7. 执行实体生命周期钩子
8. 返回经过 ResultDTO 剪裁的结果

Binding 系统与 NICOT 的 CRUD 生命周期保持一致，也可自由组合和继承。

---

### 小结

Binding 系统提供了：

- `@BindingColumn`：声明需要绑定的字段
- `@BindingValue`：绑定值的来源
- `useBinding`：单次调用级覆盖
- `beforeSuper`：override 时保证并发安全
- request-scope provider：推荐的绑定上下文提供方式，彻底避免并发污染

这套机制让 NICOT 在保持自动化 CRUD 的同时，也能优雅支持多租户隔离、权限隔离与上下文驱动业务逻辑。

---

## Upsert：按冲突键执行幂等写入（PUT /resource）

Upsert 会根据显式声明的冲突键插入新行，或更新已经匹配的行。它有独立的
DTO、验证和生命周期，不复用 create/update 规则，并会把 Binding 纳入冲突键，
避免跨租户覆盖。

### 1. 使用 `@UpsertColumn` 声明冲突键

```ts
@Entity()
@UpsertableEntity()
export class Article extends IdBase() {
  @UpsertColumn()
  @StringColumn(64, { required: true, description: '租户内唯一 slug' })
  slug: string;

  @StringColumn(255, { required: true })
  title: string;

  isValidInUpsert() {
    return !this.slug ? 'slug is required' : undefined;
  }

  async beforeUpsert() {}
  async afterUpsert() {}
}
```

只有挂了 `@UpsertColumn()` 的字段才会成为自然冲突键。Upsert 使用
`isValidInUpsert()`、`beforeUpsert()` 和 `afterUpsert()`，与 create/update
生命周期彼此独立。

### 2. 使用 `@UpsertableEntity` 启用 Upsert

`@UpsertableEntity()` 会检查实体至少存在一个 UpsertColumn、BindingColumn，
或可用于 upsert 的基础 ID，并为有效冲突键建立数据库 UNIQUE 约束，以满足
PostgreSQL `INSERT ... ON CONFLICT (...) DO UPDATE` 的要求。

实际冲突键由所有 `@UpsertColumn()` 与 `@BindingColumn()` 共同组成；如果最终
只剩主键，则直接使用主键约束。

### 3. StringIdBase 的 UUID 与手动 ID

- `StringIdBase({ uuid: true })` 的 ID 由数据库生成，通常应另行声明自然冲突键。
- `StringIdBase({ uuid: false })` 或省略 `uuid` 时，ID 由客户端提供，默认可作为
  自然键参与 upsert。
- 如果同时把 ID 和其他字段纳入冲突键，匹配条件是完整 tuple；不要在希望
  `slug` 单独决定身份时误把 ID 也纳入组合键。

### 4. Upsert 与 Binding

BindingColumn 会自动加入冲突键：

```ts
@Entity()
@UpsertableEntity()
export class TenantArticle extends IdBase() {
  @BindingColumn('app')
  @IntColumn('int', { unsigned: true })
  appId: number;

  @UpsertColumn()
  @StringColumn(64)
  slug: string;

  @StringColumn(255)
  title: string;
}

@Injectable()
export class TenantArticleService extends CrudService(TenantArticle) {
  constructor(@InjectRepository(TenantArticle) repo) {
    super(repo);
  }

  @BindingValue('app')
  get currentAppId() {
    return 44;
  }
}
```

这里的有效冲突键是 `(appId, slug)`，不同租户的相同 slug 不会互相覆盖。

### 5. 暴露 PUT Upsert 接口

```ts
export const ArticleFactory = new RestfulFactory(TenantArticle, {
  relations: ['author'],
  upsertIncludeRelations: true,
  skipNonQueryableFields: true,
});

@Injectable()
export class ArticleService extends ArticleFactory.crudService() {
  constructor(@InjectRepository(TenantArticle) repo) {
    super(repo);
  }
}

export class UpsertArticleDto extends ArticleFactory.upsertDto {}

@Controller('articles')
export class ArticleController {
  constructor(private readonly service: ArticleService) {}

  @ArticleFactory.upsert()
  upsert(@ArticleFactory.upsertParam() dto: UpsertArticleDto) {
    return this.service.upsert(dto);
  }
}
```

这会生成 `PUT /articles`。开启 `upsertIncludeRelations` 后，NICOT 会重新查询
保存结果、按 factory 的 relations 加载关系并返回完整结构；关闭时只返回实体
自身字段。

### 6. 软删除恢复

如果冲突键匹配到已经软删除的行，NICOT 会清空 `deleteTime`，使用
`withDeleted()` 重新读取并在需要时显式 restore，使 delete → upsert 仍保持幂等。

### 7. 推荐实践

- 使用 `slug`、`code`、`externalId` 等稳定自然键。
- 多租户实体把 UpsertColumn 与 BindingColumn 组合成唯一键。
- 把 upsert 专用验证放进 `isValidInUpsert()`。
- 手动字符串 ID 默认作为自然键；只有明确需要组合身份时才增加其他冲突字段。



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
import { Entity, ManyToOne, OneToMany, type Relation } from 'typeorm';

@Entity()
export class User extends IdBase() {
  @OneToMany(() => Article, article => article.user)
  articles: Article[];
}

// article.entity.ts
@Entity()
export class Article extends IdBase() {
  @ManyToOne(() => User, user => user.articles)
  user: Relation<User>;
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

### NestJS 12 / ESM 下的关系类型规则

TypeORM 关系装饰器必须始终显式传入延迟求值的目标类型，例如
`() => User`。关系属性根据是否为集合采用不同写法：

- 集合关系：`articles: Article[]`
- 单值关系：`author: Relation<User>`

这个区别在 ESM 下很重要。单值字段直接写成 `author: User` 时，TypeScript
可能生成 `design:type = User`，实体文件存在循环依赖时会在模块尚未初始化完成前
访问 `User`，从而触发 temporal dead zone 错误。`Relation<User>` 只会生成
`design:type = Object`，不会在装饰器执行阶段提前读取对端 class。

数组字段直接写成 `Article[]` 时生成的是 `design:type = Array`，不会直接引用
`Article`，因此是安全的。对于普通 TypeORM relation，NICOT 会从
`@OneToMany(() => Article)` / `@ManyToOne(() => User)` 保存的 TypeORM metadata
取得目标 class，并从 relation 类型判断是否为集合，不依赖具体的 `design:type`。

### @RelationComputed：标记“由关系推导出的 NotColumn 字段”

有些字段本身不落库（NotColumn），但它是由若干关系字段组合出来的，并且你希望它可以：

- 出现在 Result DTO 中，  
- 同时不把整棵关联树一路无限展开。

这种场景使用 @RelationComputed。

`@RelationComputed` 必须显式提供 `() => T`。单值计算关系使用
`Relation<T>`，集合计算关系保持为 `T[]`。不能把集合计算关系写成
`Relation<T[]>`：当前实现通过 `design:type === Array` 判断它是不是集合，而
`Relation<T[]>` 只会生成 `Object`，最终会被错误地当成单值关系。

```ts
@NotColumn()
@RelationComputed(() => Article)
bestArticle: Relation<Article>; // 单值：Relation<T>

@NotColumn()
@RelationComputed(() => Article)
recentArticles: Article[]; // 集合：T[]
```

```ts
import { Entity, ManyToOne, OneToMany, type Relation } from 'typeorm';

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
  player1: Relation<Participant>;

  @ManyToOne(() => Participant, p => p.matches2)
  player2: Relation<Participant>;

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
- 集合 relation 使用 `T[]`，单值 relation 使用 `Relation<T>`。
- 所有对外需要返回的关系字段，集中在 xxx.factory.ts 的 relations 里配置。  
- 复杂组合 / 聚合字段（NotColumn）使用带显式 callback 的 @RelationComputed，再加到 relations 里。

---

## 统一返回结构

NICOT 的响应统一使用下面的 envelope：

```ts
{
  statusCode: number;
  success: boolean;
  message: string;
  timestamp?: string;
  data?: unknown;
}
```

通用类型包括：

- `ReturnMessageDto(Entity)`：单条数据。
- `PaginatedReturnMessageDto(Entity)`：包含 `total`、`totalPages` 等页码信息。
- `CursorPaginationReturnMessageDto(Entity)`：包含 `nextCursor`、`previousCursor`。
- `BlankReturnMessageDto`：没有 data 的响应。

`RestfulFactory` 同时生成对应的 `entityReturnMessageDto`、
`entityCreateReturnMessageDto`、`entityArrayReturnMessageDto` 和
`entityCursorPaginationReturnMessageDto`。自定义接口也可以直接复用这些 wrapper，
以保持返回和 Swagger schema 一致。

---

## Transactional TypeORM：请求级事务

默认情况下，多次 repository 调用不会自动合并为一个事务。希望“一次 HTTP 请求
= 一个数据库事务”时，可组合下面两个入口：

- `TransactionalTypeOrmModule.forFeature(...)`：提供 request-scoped、事务感知的
  `EntityManager` / `Repository`，并包含和导出 TypeORM `forFeature()`。
- `TransactionalTypeOrmInterceptor()`：在请求进入时开启事务，正常结束时提交，
  抛错时回滚。

模块仍需在根部通过 `TypeOrmModule.forRoot(...)` 配置 DataSource：

```ts
@Module({
  imports: [TransactionalTypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

Controller 开启请求级事务，并让 Service 使用同一事务中的 repository：

```ts
@Controller('users')
@UseInterceptors(TransactionalTypeOrmInterceptor())
export class UserController extends UserFactory.baseController() {
  constructor(service: UserService) {
    super(service);
  }
}

@Injectable()
export class UserService extends UserFactory.crudService() {
  constructor(
    @InjectTransactionalRepository(User)
    repo: Repository<User>,
  ) {
    super(repo);
  }
}
```

需要跨 repository 的复杂操作时，可以注入
`@InjectTransactionalEntityManager() em: EntityManager`。事务适合多次写入必须一起
提交或回滚的短请求；不要用于 SSE / 长连接，也不必强加给昂贵但纯只读的接口。

---

## Entity Operation：单实体原子业务操作

NICOT 的 operation 分成互相独立的两层：

1. `CrudService.operation()` 执行领域逻辑。
2. `RestfulFactory.operation()` 把该逻辑暴露成标准 HTTP 接口。

Service operation 会在 Binding 范围内检查实体，开启事务并以
`pessimistic_write` 锁读取目标行，执行 callback，随后只写回发生变化的列；callback
抛出的异常会使事务回滚。

```ts
@Injectable()
export class UserService extends UserFactory.crudService() {
  async disableUser(id: number) {
    return this.operation(id, async user => {
      user.isActive = false;
      return { disabled: true };
    });
  }
}
```

callback 返回 `void` / `undefined` / `null` 时得到空的成功响应；返回其他数据时得到
`GenericReturnMessageDto`。实体上的 `@BindingColumn` 与 Service 上的
`@BindingValue` 会自动限制存在性检查、加锁和更新范围。

如果外层已经由 request transaction 管理事务，可传入 `options.repo`，避免再开启
嵌套事务：

```ts
return this.operation(
  id,
  async user => {
    user.name = 'Updated in request transaction';
  },
  { repo: this.repo },
);
```

Controller 层的 operation 只声明路由、Swagger metadata 和统一响应，不承载业务
逻辑：

```ts
@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @UserFactory.operation('disable')
  disable(@UserFactory.idParam() id: number) {
    return this.service.disableUser(id);
  }
}
```

这会生成 `POST /users/:id/disable`。需要自定义响应数据类型时可传
`{ returnType: ResetPasswordResultDto }`。推荐把可测试、可复用的业务逻辑放在
Service operation 中，让 Controller 只负责声明接口。

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

## CrudBase 与 CrudService

`CrudBase<T>` 承担 NICOT 的核心 CRUD 与查询行为：

- `create(ent, beforeCreate?)`
- `findOne(id, extraQuery?)`
- `findAll(dto?, extraQuery?)`
- `findAllCursorPaginated(dto?, extraQuery?)`
- `update(id, dto, cond?)`
- `delete(id, cond?)`
- `importEntities(entities, extraChecking?)`
- `exists(id)`
- `onModuleInit()`（加载 PostgreSQL 全文索引）

这些方法统一处理 relations、Binding、`NotInResult` / `outputFieldsToOmit`
以及实体的验证和生命周期钩子。通常不直接继承 `CrudBase`，而是让 factory
生成 Service：

```ts
export const UserFactory = new RestfulFactory(User, {
  relations: ['articles'],
});

@Injectable()
export class UserService extends UserFactory.crudService() {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }
}
```

自定义业务方法仍可直接调用 TypeORM repository，但那样不会自动执行
`beforeGet()`、`afterGet()` 等 NICOT 生命周期。希望保留 NICOT 行为时，应从
`CrudBase` / `CrudService` 的方法进入。

---

## RestfulFactory：DTO 与 Controller 生成器

`RestfulFactory<T>` 把 entity metadata 映射为 DTO、Swagger schema、参数管道和
Controller 装饰器。常用 options 包括：

```ts
interface RestfulFactoryOptions<T> {
  fieldsToOmit?: (keyof T)[];
  writeFieldsToOmit?: (keyof T)[];
  createFieldsToOmit?: (keyof T)[];
  updateFieldsToOmit?: (keyof T)[];
  findAllFieldsToOmit?: (keyof T)[];
  outputFieldsToOmit?: (keyof T)[];
  prefix?: string;
  keepEntityVersioningDates?: boolean;
  entityClassName?: string;
  relations?: (string | RelationDef)[];
  skipNonQueryableFields?: boolean;
}
```

- `relations` 同时决定要加载的关系与 Result DTO / OpenAPI 中公开的关系深度。
- `outputFieldsToOmit` 在 `@NotInResult` 之外继续裁剪返回字段。
- `prefix` 给工厂生成的路由增加统一前缀。
- `skipNonQueryableFields` 只让显式 `@QueryXXX` 字段进入查询 DTO。

工厂提供成对的路由与参数装饰器：

- `create()` / `createParam()`
- `findOne()` / `idParam()`
- `findAll()` 或 `findAllCursorPaginated()` / `findAllParam()`
- `update()` / `updateParam()`
- `delete()`
- `import()`（`POST /import`）
- `upsert()` / `upsertParam()`（启用 Upsert 时）

它们会组合 Nest HTTP 路由、Swagger response、Validation/Transform 管道和 NICOT
返回类型。需要插入业务逻辑时使用后文的手写 Controller；没有额外逻辑时可直接
生成完整 Controller：

```ts
@Controller('users')
export class UserController extends UserFactory.baseController({
  paginateType: 'offset', // 'offset' | 'cursor' | 'none'
  globalMethodDecorators: [],
  routes: {
    import: { enabled: false },
  },
}) {
  constructor(service: UserService) {
    super(service);
  }
}
```

如果 `routes` 中任意路由写了 `enabled: true`，只生成明确启用的路由；否则默认
生成全部路由，仅排除 `enabled: false` 的条目。

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

## 最佳实践

- 每个实体建立一个独立的 `*.factory.ts`，让 entity、factory、service 和
  controller 解耦，同时共享同一份接口配置。
- 让实体拥有完整契约：列类型、验证、访问控制（`@NotWritable`、
  `@NotInResult`、`@NotQueryable`）和允许公开的查询能力（`@QueryXXX`）。
- 所有 TypeORM relation 装饰器都显式传入 `() => T`；集合属性使用 `T[]`，
  单值属性使用 `Relation<T>`。`RelationComputed` 也遵循同一规则，其中集合字段
  必须保持直接数组类型，才能保留 `design:type = Array`。
- 列表接口优先开启 `skipNonQueryableFields: true`，只给确实允许公开查询的字段
  添加 `@QueryXXX`。
- NICOT 管理的资源优先通过 `CrudService` / `CrudBase` 访问，使生命周期、relations
  与返回裁剪保持一致。
- 直接使用 TypeORM repository 的代码应当是边界清晰的自定义流程，并明确它不会
  自动经过 NICOT 生命周期。

---

## 安装

```bash
npm install nicot @nestjs/config typeorm @nestjs/typeorm class-validator class-transformer reflect-metadata @nestjs/swagger
```

当前版本面向：

- NestJS ^12
- `@nestjs/typeorm` ^12
- TypeORM ^0.3.27 或 ^1
- Node.js ^20.19、^22.12 或 >=24

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
