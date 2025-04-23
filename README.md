# NICOT

**NICOT** 是一个基于 NestJS + TypeORM 的后端开发框架。通过实体定义即生成：
- 数据库模型（TypeORM）
- 字段校验（class-validator）
- 请求 DTO（Create / Update / Query）
- RESTful 接口与文档（Swagger）
- 统一返回结构、查询控制、权限注入等

适用于希望快速搭建标准化接口、减少重复代码的后端项目。

---

## 📦 安装

```bash
npm install nicot typeorm @nestjs/typeorm class-validator class-transformer reflect-metadata @nestjs/swagger
```

---

## 🧱 定义实体 Entity

```ts
@Entity()
class User extends IdBase() {
  @QueryEqual()
  @StringColumn(255, {
    required: true,
    description: '用户名',
  })
  name: string;

  @IntColumn('int', { unsigned: true })
  age: number;

  @StringColumn(255)
  @NotInResult()
  password: string;

  @DateColumn()
  @NotWritable()
  createdAt: Date;
}
```

---

## 🧾 主键基础类：IdBase / StringIdBase

在定义实体时，NICOT 提供了两种基础类 `IdBase` 与 `StringIdBase`，可作为实体的继承基类，为你自动处理：

- 主键字段定义（自增或字符串主键）
- 主键字段的权限控制与文档注解
- 默认排序逻辑（id 降序 / 升序）
- 支持 queryBuilder 查询条件注入

---

### 1. `IdBase()` - 数字主键（自增）

适合常见的自增整型主键使用场景。

```ts
@Entity()
class User extends IdBase() {
  // 继承字段：id: number (bigint unsigned, primary key, auto-increment)
}
```

- 自动添加字段：`id: number`
- 默认排序为 `ORDER BY id DESC`
- 使用 `Generated('increment')` 作为主键生成策略
- 搭配 `@IntColumn` + `@NotWritable()`，在创建 / 修改时不可写

---

### 2. `StringIdBase()` - 字符串主键（手动或 UUID）

适合你希望使用业务主键或 UUID 作为主键的场景。传入 `uuid: true` 参数后自动生成 UUID 主键。

```ts
@Entity()
class ApiKey extends StringIdBase({ uuid: true, description: 'API 密钥 ID' }) {
  // 继承字段：id: string (uuid, primary key)
}
```

- 自动添加字段：`id: string`
- 默认排序为 `ORDER BY id ASC`
- 支持配置长度（`length`）和描述（`description`）
- `uuid: true` 时自动添加 `@Generated('uuid')`

---

### 3. 示例对比

```ts
@Entity()
class Article extends IdBase({ description: '文章 ID' }) {
  // id: number 自动生成
}

@Entity()
class Token extends StringIdBase({
  uuid: true,
  description: '访问令牌',
}) {
  // id: string，自动生成 UUID
}
```

---

### 小结

| 基类            | 主键类型   | 排序默认 | ID 生成策略         | 使用场景               |
|-----------------|------------|----------|----------------------|------------------------|
| `IdBase()`      | number     | DESC     | 自增 `Generated('increment')` | 常规实体 ID             |
| `StringIdBase()`| string     | ASC      | 可选 UUID / 手动输入 | UUID 主键、业务主键等   |

建议你为每个实体都继承其中一个基类，以统一主键结构和查询逻辑。

---

## 🧠 字段装饰器总览

NICOT 提供了一系列 `***Column()` 装饰器，统一处理字段的：

- 数据类型定义（TypeORM）
- 输入校验（class-validator）
- 文档描述（@nestjs/swagger）

### 字段类型装饰器（`***Column()`）

| 装饰器名             | 数据类型       | 自动添加的验证与文档            |
|----------------------|----------------|---------------------------------|
| `@StringColumn(len)` | string         | `@IsString()` + `@Length()`     |
| `@IntColumn(type)`   | int/bigint/... | `@IsInt()` + Swagger number 类型 |
| `@FloatColumn(type)` | float/decimal  | `@IsNumber()`                   |
| `@BoolColumn()`      | boolean        | `@IsBoolean()`                  |
| `@DateColumn()`      | Date           | `@IsDate()`                     |
| `@JsonColumn(T)`     | 任意对象/数组  | `@IsObject()` / `@ValidateNested()` 等 |

所有字段装饰器都支持第二个参数 `options`：

```ts
@StringColumn(255, {
  required: true,
  description: '用户名',
  default: 'Anonymous',
})
name: string;
```

---

## 🔒 字段访问限制装饰器（行为控制）

NICOT 提供以下装饰器用于控制字段在不同接口中的表现：

| 装饰器名                                   | 行为控制说明                        |
|----------------------------------------|-------------------------------|
| `@NotWritable()`                       | 不允许在创建（POST）或修改（PATCH）时传入     |
| `@NotChangeable()`                     | 不允许在修改（PATCH）时更新（只可创建）        |
| `@NotQueryable()`                      | 不允许在 GET 查询参数中使用该字段           |
| `@NotInResult()`                       | 不会出现在任何返回结果中（如密码字段）           |
| `@NotColumn()`                         | 不是数据库字段（仅逻辑字段，如计算用字段）         |
| `@RelationComputed(() => EntityClass)` | 标识该字段依赖关系字段推导而来（通常在 afterGet） |

RestfulFactory 处理 Entity 类的时候，会以这些装饰器为依据，裁剪生成的 DTO 和查询参数。

这些限制装饰器非常适合处理：

- 安全字段（如密码、Token）
- 系统字段（如创建时间、创建者 ID）
- 只读字段（如 auto-increment 主键）

---

### 示例：完整字段定义

```ts
@StringColumn(255, {
  required: true,
  description: '用户昵称',
})
@NotWritable()
nickname: string;

@BoolColumn()
@QueryMatchBoolean()
isActive: boolean;
```

---

## 🔍 查询装饰器总览（Query 系列）

NICOT 提供了一套查询装饰器，用于在 Entity 字段上声明支持的 GET 查询条件。它们会自动应用到 `findAll()` 中的 queryBuilder。

### ✅ 内建查询装饰器

| 装饰器名                     | 查询效果                                       |
|-----------------------------|------------------------------------------------|
| `@QueryEqual()`              | 精确匹配：`WHERE field = :value`              |
| `@QueryLike()`               | 前缀模糊匹配：`WHERE field LIKE :value%`      |
| `@QuerySearch()`             | 宽泛模糊搜索：`WHERE field LIKE %:value%`     |
| `@QueryMatchBoolean()`       | `true/false/1/0` 转换为布尔类型查询            |
| `@QueryEqualZeroNullable()`  | `0 → IS NULL`，否则 `= :value`（适合 nullable）|
| `@QueryGreater()`            | 大于查询：`WHERE field > :value`              |
| `@QueryOrderBy()`            | 排序字段控制：`ORDER BY field ASC|DESC`      |

---

## 🛠 自定义查询装饰器：`QueryCondition()`

如果你需要构建更复杂或专用的查询逻辑，可以使用 `QueryCondition()` 创建自己的装饰器：

### 示例：大于查询

```ts
export const QueryGreater = () =>
  QueryCondition((dto, qb, alias, key) => {
    if (dto[key] != null) {
      qb.andWhere(`${alias}.${key} > :${key}`, { [key]: dto[key] });
    }
  });
```

### 示例：动态排序字段（带字段名映射）

```ts
export const QueryOrderBy = () =>
  QueryCondition((dto, qb, alias, key) => {
    const orderValue = dto[key];
    if (orderValue) {
      const originalKey = key.replace(/OrderBy$/, '');
      qb.addOrderBy(`${alias}.${originalKey}`, orderValue);
    }
  });
```

> 使用方式与普通装饰器一致，应用在实体字段上即可。

---

### 使用效果示例

```ts
@IntColumn('int', { unsigned: true })
@QueryGreater()
views: number;

@StringColumn(255)
@QueryLike()
title: string;

@BoolColumn()
@QueryMatchBoolean()
isPublished: boolean;

@NotWritable()
@NotInResult()
@QueryOrderBy()
@IsIn(['ASC', 'DESC'])
@ApiProperty({ enum: ['ASC', 'DESC'], description: 'Order by views' })
viewsOrderBy?: 'ASC' | 'DESC';
```



---

## 🔁 生命周期钩子

支持在实体中定义以下方法：

```ts
class User {
  async beforeCreate() {}
  async afterCreate() {}
  async beforeUpdate() {}
  async afterUpdate() {}
  async beforeGet() {}
  async afterGet() {}

  isValidInCreate(): string | undefined {
    return this.name ? undefined : '必须填写名称';
  }
}
```

---

## 🛠 使用 CrudService（服务层标准写法）

NICOT 提供了 `CrudService(Entity, options)`，是所有资源的标准服务实现方式。

你只需继承它，并传入对应的实体和配置，即可拥有完整的：
- 查询（支持分页、排序、过滤、关系）
- 创建、更新、删除（带钩子、校验、字段控制）
- 统一返回结构

---

### 定义 Service

```ts
import { CrudService } from 'nicot';

@Injectable()
export class ArticleService extends CrudService(Article, {
  relations: ['user'], // 自动关联 user 实体（LEFT JOIN）
}) {
  constructor(@InjectRepository(Article) repo) {
    super(repo);
  }

  // 可根据需要添加业务方法（非覆盖）
  async downloadArticle(id: number): Promise<Buffer> {
    const res = await this.findOne(id);
    return res.data.getContentAsBuffer();
  }
}
```

---

### 关于 relations

`relations: string[]` 是 `CrudService` 的核心配置项之一。它用于在查询中自动加载关联实体（即 TypeORM 的 `leftJoinAndSelect`）。

- `'user'` 表示加载 `article.user`
- `'user.articles'` 表示递归加载嵌套关系
- 默认使用 `LEFT JOIN`，如需 `INNER JOIN` 可通过 `Inner('user')` 指定

这能确保你在 Controller 中无需手动构建复杂的 join 查询。

---

### 方法列表

| 方法名           | 说明                                   |
|------------------|----------------------------------------|
| `findAll(dto, qb?)` | 查询列表（支持查询装饰器 / 分页）     |
| `findOne(id, qb?)`  | 查单条数据，自动关联 / 过滤 / 封装     |
| `create(dto)`       | 创建数据，带验证、钩子处理             |
| `update(id, dto, extraConditions?)` | 更新数据并支持条件限制 |
| `delete(id, extraConditions?)`      | 删除数据（软删）         |

---

### 示例：条件限制用户只能操作自己数据

```ts
async findOne(id: number, user: User) {
  return this.service.findOne(id, qb => qb.andWhere('userId = :uid', { uid: user.id }));
}

async update(id: number, dto: UpdateDto, user: User) {
  return this.service.update(id, dto, { userId: user.id }); // 附加 where 条件
}
```

---

### 建议实践

- 所有实体的服务类都应继承 `CrudService(Entity, options)`
- `relations` 是推荐使用的配置方式，替代手动 join
- 如果你有定制查询逻辑，建议用 `super.findAll(...)` + `.data` 进行后处理
- 避免直接使用 `repo`，使用封装后的方法保持一致性与钩子逻辑生效

---

## 🧩 Controller 自动生成（RestfulFactory）

NICOT 提供了 `RestfulFactory(Entity)` 工厂函数，自动为实体生成标准 RESTful Controller 接口装饰器及参数提取器。

你不再需要手动定义每个路由，只需：

1. 创建 DTO（工厂生成）
2. 使用工厂提供的装饰器

---

### 一键生成的接口说明

| 方法                     | 路径                    | 功能说明                  |
|--------------------------|-------------------------|---------------------------|
| `@factory.create()`      | `POST /`        | 创建，使用 `createDto`    |
| `@factory.findOne()`     | `GET /:id`     | 获取单条数据              |
| `@factory.findAll()`     | `GET /`         | 查询列表，支持过滤 / 分页 |
| `@factory.update()`      | `PATCH /:id`   | 修改单条数据              |
| `@factory.delete()`      | `DELETE /:id`  | 删除单条数据（软删）      |

---

### 参数提取装饰器一览

| 装饰器                     | 用途说明                                |
|----------------------------|-----------------------------------------|
| `@factory.createParam()`   | 注入 `createDto`，自动校验 body         |
| `@factory.updateParam()`   | 注入 `updateDto`，自动校验 body         |
| `@factory.findAllParam()`  | 注入 `queryDto`，自动校验 query         |
| `@factory.idParam()`       | 注入路径参数中的 id                     |

这些参数装饰器全部内建了 `ValidationPipe`，支持自动转换与校验。

---

### 查询能力：基于实体字段的装饰器

`@factory.findAll()` 所生成的接口具有完整的查询能力，其行为由实体字段上的 `@QueryXXX()` 装饰器控制：

```ts
@StringColumn(255)
@QueryEqual()
name: string;

@BoolColumn()
@QueryMatchBoolean()
isActive: boolean;
```

则生成的 `GET /resource?name=Tom&isActive=true` 接口会自动构建对应的 SQL 条件。

---

### 示例 Controller

```ts
const factory = new RestfulFactory(User, { relations: ['articles'] });
class CreateUserDto extends factory.createDto {}
class UpdateUserDto extends factory.updateDto {}
class FindAllUserDto extends factory.findAllDto {}

@Controller('user')
export class UserController {
  constructor(private readonly service: UserService) {}

  @factory.create()
  async create(@factory.createParam() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @factory.findAll()
  async findAll(@factory.findAllParam() dto: FindAllUserDto) {
    return this.service.findAll(dto);
  }

  @factory.findOne()
  async findOne(@factory.idParam() id: number) {
    return this.service.findOne(id);
  }

  @factory.update()
  async update(@factory.idParam() id: number, @factory.updateParam() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @factory.delete()
  async delete(@factory.idParam() id: number) {
    return this.service.delete(id);
  }
}
```

---

### 补充说明

- 所有路由默认返回统一结构（`GenericReturnMessageDto` / `BlankReturnMessageDto`）
- 所有参数自动校验，无需手动加 `ValidationPipe`
- `findAll()` 自动支持分页、排序、模糊查询、布尔匹配等
- 如果你使用了实体关系（relations），则 `findOne()` / `findAll()` 也自动关联查询
- 所有的接口都是返回状态码 200。
- OpenAPI 文档会自动生成，包含所有 DTO 类型与查询参数。
- Service 需要使用 `CrudService(Entity, options)` 进行标准化实现。
- `RestfulFactory` 的选项 `options` 支持传入 `relations`，形式和 `CrudService` 一致，用于自动裁剪结果 DTO 字段。
  - 如果本内容的 `CrudService` 不查询任何关系字段，那么请设置 `{ relations: [] }` 以裁剪所有关系字段。

---

## 📄 分页查询（自动支持）

NICOT 的 `findAll()` 方法默认支持分页，**无需你手动声明分页字段**，框架内部已内置分页 DTO 与逻辑。

---

### ✅ 默认分页行为

所有 `findAll()` 查询接口会自动识别以下 query 参数：

| 参数             | 类型     | 默认值 | 说明                            |
|------------------|----------|--------|---------------------------------|
| `pageCount`      | number   | `1`    | 第几页，从 1 开始               |
| `recordsPerPage` | number   | `25`   | 每页多少条数据                  |

这些字段由框架内置的 `PageSettingsDto` 管理，自动注入到 `findAllParam()` 的 DTO 中，无需你自己定义。

分页逻辑最终会转化为：

```ts
qb.take(recordsPerPage).skip((pageCount - 1) * recordsPerPage);
```

---

### 🔧 如何更改分页行为

分页逻辑由实体继承类中的方法控制（如 `getRecordsPerPage()`），如果你希望关闭分页或调高上限，可以 override 这些方法：

```ts
@Entity()
class LogEntry extends IdBase() {
  // ...其他字段

  override getRecordsPerPage() {
    return this.recordsPerPage || 99999; // 禁用分页（或返回极大值）
  }
}
```

这样处理后，该实体的 `findAll()` 查询将默认返回所有数据。

---

### 示例：分页 + 条件查询

```ts
GET /user?name=Tom&pageCount=2&recordsPerPage=10
// 查询第 2 页，每页 10 条，筛选 name = Tom 的用户
```

你可以在 Controller 中完全不关心这些字段，它们已由 NICOT 自动注入、处理并应用在 QueryBuilder 上。

---

## 📦 统一返回结构与接口注解

NICOT 默认提供统一的接口返回格式与 Swagger 自动注解能力，便于前后端标准化对接。

---

### ✅ 返回结构 DTO 类型（用于 Swagger 类型标注）

#### `ReturnMessageDto(EntityClass)`  
用于生成带数据的标准返回结构类型（**不是直接返回值**，用于 `@nestjs/swagger`）。

返回结构样式：

```json
{
  "statusCode": 200,
  "success": true,
  "message": "success",
  "timestamp": "2025-04-25T12:00:00.000Z",
  "data": { ... }
}
```

#### `BlankReturnMessageDto`  
无数据返回结构的类型（用于 DELETE、UPDATE 等空响应）。

---

### 📊 实际返回结构

- **返回数据：**

```ts
import { GenericReturnMessageDto } from 'nicot';

return new GenericReturnMessageDto(200, '操作成功', data);
```

- **返回空结构：**

```ts
import { BlankReturnMessageDto } from 'nicot';

return new BlankReturnMessageDto(204, '删除成功');
```

- **抛出异常结构：**

```ts
throw new BlankReturnMessageDto(404, '未找到资源').toException();
```

---

### 📚 Swagger 注解装饰器

NICOT 提供以下装饰器帮助你自动声明接口返回结构，无需手动写复杂的 `@ApiResponse(...)`：

#### `@ApiTypeResponse(EntityClass)`

等价于：

```ts
@ApiOkResponse({
  type: ReturnMessageDto(EntityClass),
  description: '成功响应结构',
})
```

#### `@ApiError(code, message)`

等价于：

```ts
@ApiResponse({
  status: code,
  description: message,
  type: BlankReturnMessageDto,
})
```

---

### 示例用法

```ts
@Get()
@ApiTypeResponse(User)
@ApiError(404, '未找到用户')
async findOne(@Query() dto: SearchDto) {
  const user = await this.service.findOne(dto);
  if (!user) {
    throw new BlankReturnMessageDto(404, '未找到用户').toException();
  }
  return new GenericReturnMessageDto(200, '成功', user);
}
```

---

## 📥 参数解析 + 验证（DataQuery / DataBody）

NICOT 提供便捷装饰器 `@DataQuery()` 与 `@DataBody()`，用于自动完成：

- 参数绑定（从 query 或 body）
- 数据校验（class-validator）
- 类型转换（`transform: true`）
- 避免重复书写 ValidationPipe

---

### ✅ 装饰器对照说明

| 装饰器         | 等价于标准写法                                                              |
|----------------|-------------------------------------------------------------------------------|
| `@DataQuery()` | `@Query(new ValidationPipe({ transform: true }))`           |
| `@DataBody()`  | `@Body(new ValidationPipe({ transform: true }))`            |

这些装饰器默认启用了：
- 自动类型转换（如 query string 转 number）
- 自动剔除未声明字段（`whitelist: true`）
- 自动抛出校验异常（422）

---

### 示例用法

```ts
@Get()
async findAll(@DataQuery() dto: SearchUserDto) {
  return this.service.findAll(dto);
}

@Post()
async create(@DataBody() dto: CreateUserDto) {
  return this.service.create(dto);
}
```

你无需手动加 `ValidationPipe`，也无需手动处理转换错误或格式校验，NICOT 帮你做好了这一切。

---

## 🧩 实体关系示例

```ts
@Entity()
class Article extends IdBase() {
  @QueryEqual()
  @IntColumn('bigint', { unsigned: true })
  userId: number;

  @ManyToOne(() => User, user => user.articles, { onDelete: 'CASCADE' })
  user: User;
}

@Entity()
class User extends IdBase() {
  @OneToMany(() => Article, article => article.user)
  articles: Article[];

  async afterGet() {
    this.articleCount = this.articles.length;
  }
}
```

---

## 📊 和同类框架的对比

在实际开发中，很多框架也提供了 CRUD 接口构建能力，但存在不同程度的痛点。NICOT 从底层设计上解决了这些问题，适合长期维护的中大型后端项目。

---

### ✅ FastAPI / SQLModel（Python）

- ✅ 代码简洁，自动生成 OpenAPI 文档
- ❌ 无字段权限控制（不能区分不可写/不可查）
- ❌ 查询能力不够细致，字段粒度控制弱
- ❌ DTO 拆分需手动处理，复杂模型重复多

🔹 **NICOT 优势：**
- 字段级别控制查询/写入/输出行为
- 自动生成 DTO + 查询 + OpenAPI + 验证
- 生命周期钩子和逻辑注入更灵活

---

### ✅ @nestjsx/crud（NestJS）

- ✅ 快速生成接口
- ❌ 安全性差：字段查询/排序过于开放
- ❌ 控制力弱：很难注入逻辑或自定义查询
- ❌ Swagger 文档支持不完整

🔹 **NICOT 优势：**
- 每个字段查询能力需显式声明（不开放默认）
- 完全类型安全 + 文档自动生成
- 逻辑钩子、权限注入、返回结构标准化

---

### ✅ nestjs-query

- ✅ 支持 GraphQL / REST，类型安全强
- ❌ 学习曲线陡峭，文档不友好
- ❌ 查询逻辑复杂，难以上手
- ❌ 重度依赖 GraphQL 思维模式

🔹 **NICOT 优势：**
- 更贴合 REST 直觉思维
- 默认封装，低学习成本
- 保留足够扩展点，轻松注入业务逻辑

---

### ✅ GraphQL

- ✅ 查询自由，前端控制力强
- ❌ 后端控制弱，权限处理复杂
- ❌ 易产生过度查询，性能不稳定
- ❌ 每个字段都必须写解析器，开发成本高

🔹 **NICOT 优势：**
- 后端主导接口结构，前端只调 REST
- 查询能力与字段权限完全可控
- 无需额外解析器，开发更快速

---

### ✅ MyBatis-Plus / Hibernate（Java）

- ✅ 成熟，生态强，Java 企业常用
- ❌ 配置繁杂，样板代码多
- ❌ 缺乏统一的返回结构与接口注解
- ❌ 参数校验 / DTO 拆分手动重复

🔹 **NICOT 优势：**
- 一套装饰器统一字段校验 + ORM + 文档
- 自动 DTO 拆分，减少重复代码
- 全自动接口 + 验证 + 注解集成

---

### 🏆 框架能力矩阵对比

| 框架                        | 自动接口       | 安全性         | 文档支持       | 类型安全       | 查询控制         | 关系联查支持     | 开发效率       |
|-----------------------------|----------------|----------------|----------------|----------------|------------------|------------------|----------------|
| **NICOT**                   | ✅ 全自动       | ✅ 字段级控制   | ✅ 实体即文档   | ✅ 完整类型推导 | ✅ 装饰器精细控制 | ✅ 自动 relations | ✅ 极高         |
| FastAPI + SQLModel          | ✅ 模型映射生成 | ❌ 缺乏限制     | ✅ 自动生成     | ❌ 运行时类型   | ❌ 查询不受控     | 🟡 手写关系加载   | ✅ 高           |
| @nestjsx/crud               | ✅ 快速注册     | ❌ 默认全暴露   | ❌ Swagger 不完整 | ✅ Nest 类型系统 | ❌ 全字段可查     | 🟡 需手动配置     | ✅ 快速上手     |
| nestjs-query                | ✅ 自动暴露接口 | 🟡 DTO 控权限  | 🟡 手动标注文档 | ✅ 强类型推导   | 🟡 灵活但复杂     | ✅ 关系抽象良好   | ❌ 配置繁琐     |
| GraphQL（code-first）       | ❌ Resolver 必写| ❌ 查询不受控   | ✅ 类型强大     | ✅ 静态推导     | ❌ 查询过度灵活   | ✅ 查询关系强     | ❌ 繁琐/易错     |
| Hibernate（Java）           | ❌ 需配 Service | 🟡 靠注解控制   | ❌ 文档需插件   | 🟡 Java 泛型弱  | 🟡 XML/HQL 控制   | ✅ JPA 级联支持   | ❌ 模板代码多   |
| MyBatis-Plus（Java）        | ✅ 注解生成     | ✅ 手写控制     | ❌ 文档缺失     | ❌ 运行期校验   | ❌ 手写 SQL       | ❌ 需 JOIN SQL    | ❌ 重复手写多   |
| NestJS + TypeORM + 手动 DTO | ❌ 全手写       | ✅ 自由控制     | ✅ 自己写        | ✅ 类型安全     | 🟡 逻辑自己处理   | 🟡 手写 relations | ❌ 重复代码多   |

---

NICOT 作为一个 “Entity 驱动” 的框架，在开发体验、安全性、自动化程度之间找到了平衡，真正做到：

> 一份实体定义 → 自动生成完整、安全、文档完备的接口系统


---

## ✅ 总结

**NICOT = Entity 驱动 + 自动生成的一体化后端框架**，涵盖：

- 实体建模 → 校验规则 → DTO → OpenAPI
- 自动生成 Controller / Service
- 灵活字段控制、查询扩展、用户注入、生命周期钩子
- 内建返回结构、Swagger 注解、守卫装饰器等功能

是构建 NestJS 标准化、低重复、文档完善的后端服务的理想选择。
