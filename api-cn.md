# NICOT API 参考

> 本文是 **NICOT 的高级 API / 行为说明**，偏向“干货手册”而不是教程。  
> 面向已经大致看过 README 的使用者。

---

## 0. 术语约定

- **Entity / 实体类**：TypeORM 的实体类，也是 NICOT 的“单一事实源”（字段、校验、查询能力都挂在这里）。
- **Factory**：`new RestfulFactory(Entity, options)` 的实例。
- **CrudService**：由 `Factory.crudService()` 生成的 Service 基类。
- **BaseRestfulController**：`Factory.baseController()` 内部使用的基类。
- **Query DTO**：`findAllDto` / `findAllCursorPaginatedDto`。
- **Result DTO**：`entityResultDto` / `entityCreateResultDto`。

下文中 `T` 代表一个实体类的 TypeScript 类型。

---

## 1. 实体基类 & Hook

### 1.1 IdBase / StringIdBase 行为

**IdBase(idOptions?: { description?: string; noOrderById?: boolean; })**

- 字段：
  - `id: number`
  - 数据库列：`bigint unsigned` + primary + auto increment
- 默认排序：
  - 若 `noOrderById !== true`，则在 `applyQuery()` 中追加  
    `ORDER BY <alias>.id DESC`
- 校验 / 查询能力：
  - 视为“有默认值”的字段（创建时可以不传）；
  - 支持 `?id=123` 这样的等值查询；
  - Create/Update DTO 中不会暴露（不可写）。

**StringIdBase(options: { length?: number; uuid?: boolean; noOrderById?: boolean; … })**

- 字段：
  - `id: string`（primary）
- 行为分两类：
  - `uuid: true`：
    - 由数据库自动生成 UUID，Create/Update DTO 不允许写入。
  - `uuid: false / 未指定`：
    - 使用固定长度的 `varchar`，创建时必须填写，且创建后不可修改。
- 默认排序：
  - 若 `noOrderById !== true`，则追加  
    `ORDER BY <alias>.id ASC`。

可以理解为：

- **IdBase**：自增数字主键，默认“新记录在前”。
- **StringIdBase(uuid)**：字符串/UUID 主键，默认“按字典顺序”排。

### 1.2 Entity Hook 生命周期

实体类可以实现下列“约定方法”，由 CrudService 调用：

- 校验：
  - `isValidInCreate(): string | undefined`
  - `isValidInUpdate(): string | undefined`
  - 返回非空字符串 → 以 `400` 抛出统一错误响应。
- 生命周期：
  - `beforeCreate()`, `afterCreate()`
  - `beforeUpdate()`, `afterUpdate()`
  - `beforeGet()`, `afterGet()`
- 查询扩展：
  - `applyQuery(qb, entityAliasName)`  
    （IdBase / TimeBase 默认会在这里加排序等，业务也可以 override）

查询时大致顺序：

1. 构造实体实例 `ent = new EntityClass()`
2. 将 DTO 填充到 `ent`
3. `ent.beforeGet?.()`
4. `ent.applyQuery(qb, alias)`（默认排序）
5. 应用 relations（见第 7 节）
6. 应用字段上的 Query 系列装饰器
7. 应用分页（offset / cursor）
8. 执行 SQL，拿到结果
9. 对每条记录调用 `afterGet?.()`
10. 删除标记为“不应出现在结果中的字段”（见第 2 节）

---

## 2. 访问控制装饰器 & 字段裁剪

### 2.1 字段访问装饰器总览

NICOT 把“一个字段在哪些阶段可见/可写”统一交给装饰器 + Factory 配置管理。

典型装饰器：

| 装饰器                 | 作用阶段                           | 效果概述                                                                 |
|------------------------|------------------------------------|--------------------------------------------------------------------------|
| `@NotWritable()`       | Create / Update                    | 永远不可在入参中写入此字段                                              |
| `@NotCreatable()`      | Create                             | 仅在创建时不可写（更新时可写）                                          |
| `@NotChangeable()`     | Update                             | 仅在更新时不可写（创建时可写）                                          |
| `@NotQueryable()`      | GET Query DTO                      | 从查询参数 DTO 中剔除（不能用来筛选）                                   |
| `@NotInResult()`       | Result DTO                         | 从所有返回结果中剔除（包括嵌套 relation 中同名字段）                    |
| `@NotColumn()`         | DB 层                              | 不映射数据库列，适合“计算后回填”的字段                                 |
| `@QueryColumn()`       | GET Query DTO                      | 声明一个“只用于查询、不写入 DB”的字段，通常要搭配 QueryCondition 使用    |
| `@RelationComputed()`  | Result DTO / relations 剪枝        | 声明此字段由 relations 计算得出，配合 relations 配置避免无限递归         |

这些标记会在 Factory / CrudService 中统一被读取，然后决定：

- Create DTO 有哪些字段
- Update DTO 有哪些字段
- GET 的 Query DTO 有哪些字段
- Result DTO 要剔除哪些字段

### 2.2 DTO 裁剪规则（优先级）

从逻辑上可以概括为：

- **Create DTO**：
  - 剔除：所有 `NotColumn`、所有 relations、`NotWritable`、`NotCreatable`，以及工厂里显式声明要 omit 的字段。
- **Update DTO**：
  - 剔除：所有 `NotColumn`、所有 relations、`NotWritable`、`NotChangeable`，以及工厂级 omit。
- **FindAll DTO（查询入参）**：
  - 剔除：
    - 所有 `NotColumn`
    - 所有 relations
    - `NotQueryable`
    - 那些“声明了需要 mutator 但没有真正提供 mutator”的字段
    - 工厂级 omit
- **Result DTO**：
  - 剔除：
    - 所有标记为“结果中不应出现”的字段（包含部分时间戳/版本字段）
    - 工厂级 `outputFieldsToOmit`
    - 未出现在 relations 白名单中的 relations（见第 7 节）

可以很粗暴地记成一条：

> **一个字段要出现在某个阶段（Create / Update / 查询参数 / 结果），必须同时被“装饰器”和“Factory 配置”放行。**

作为框架使用者，你只需要决定：

- 给字段挂哪个访问装饰器；
- Factory 上是否进一步配置 `fieldsToOmit` / `outputFieldsToOmit` 等。

---

## 3. Query 系列：QueryCondition / QueryXXX 组合

### 3.1 QueryCondition 的角色

`QueryCondition` 是一类装饰器的“底层”，用于描述：

> “这个字段出现在查询 DTO 里时，应当如何映射到 SQL 的 WHERE 条件。”

NICOT 会在所有 GET 查询中：

1. 收集实体上所有带有 QueryCondition 的字段；
2. 如果请求 DTO 对该字段提供了值；
3. 通过字段上挂的逻辑，给 `SelectQueryBuilder` 追加条件。

**只作用于 GET 查询**，不会影响：

- 创建 / 更新；
- 删除。

### 3.2 常用 Query 包装器

NICOT 提供了一系列工厂方法，方便你通过装饰器描述常见的 SQL 形式。例如：

- `QueryEqual()`：
  - `?status=1` → `status = :status`。
- `QueryLike()`：
  - `?name=ab` → `name LIKE 'ab%'`。
- `QuerySearch()`：
  - `?name=ab` → `name LIKE '%ab%'`。
- `QueryIn()`：
  - `?ids=1,2,3` 或 `?ids[]=1&ids[]=2` → `id IN (:...ids)`。
- `QueryNotIn()`：
  - 对应 `NOT IN`。
- `QueryMatchBoolean()`：
  - 将 `true / false / 1 / 0 / 'true' / 'false'` 等解析成真正布尔，然后生成 `= TRUE/FALSE`。
- `QueryEqualZeroNullable()`：
  - `?foo=0` / `?foo=0,0` → 将 0 解释为 “NULL”，生成 `IS NULL`；否则 `=`。

这些都属于“查询表达式模板”，通过装饰器挂在实体字段上：

```ts
class User {
  @QueryEqual()
  status: number;

  @QueryLike()
  name: string;

  @QueryIn()
  ids: number[];
}
```

GET 时只要 query DTO 带上这些字段，就会自动映射为对应的 SQL 条件。

### 3.3 组合：QueryAnd / QueryOr

有些场景你希望“一个字段挂多个查询逻辑”，例如：

- 一个字段同时满足“模糊匹配”和“大小写无关”的组合；
- 或者使用 OR 把多个 QueryCondition 拼成“多种搜索方式之一”。

NICOT 提供了：

- `QueryAnd(A, B, C...)`：
  - 按顺序把多个 QueryCondition 对应的条件全部 AND 在一起。
- `QueryOr(A, B, C...)`：
  - 每个条件内部保持自己的 AND 结构，然后整个语句以 OR 连接。

用法示例（伪代码）：

```ts
class Article {
  // 同一个字段上，同时支持 A/B 两套 QueryCondition，
  // 但最终把 A 和 B 的表达式 OR 起来
  @QueryOr(QueryLike(), QueryEqual())
  title: string;
}
```

你可以把它当成“逻辑积木”，但无需关心内部如何生成括号和参数名——只要知道：

- A 和 B 依然各自依赖字段值；
- A 与 B 的表达式组合方式由 `QueryAnd/QueryOr` 决定。

---

## 4. PostgreSQL 全文搜索（QueryFullText）

### 4.1 使用场景

`QueryFullText` 是一个专门面向 **PostgreSQL** 的查询装饰器，适用于：

- 标记某个文本列为“全文搜索字段”；
- 让 GET Query DTO 支持“`?q=关键字`”这样的查询；
- 可选按照匹配度 `ts_rank` 排序。

核心能力包括：

- 自动创建全文索引（GIN + `to_tsvector(...)`）；
- 自动创建/配置 text search configuration（若指定了 parser，例如中文分词）；
- 在查询时自动生成 `to_tsvector(...) @@ websearch_to_tsquery(...)` 之类的表达式；
- 可选地根据匹配度降序排序。

### 4.2 配置要点

装饰器形态大致为：

```ts
class Article {
  @QueryFullText({
    // parser / configuration 二选一：
    // - 指定 parser（例如 'zhparser'）会为当前实体创建 nicot 自己的配置
    // - 或直接指定 configuration 名（比如 'english'）
    parser?: string;
    configuration?: string;

    // tsQuery 函数名称，默认 'websearch_to_tsquery'
    tsQueryFunction?: string;

    // 是否在结果中按相似度排序
    orderBySimilarity?: boolean;
  })
  content: string;
}
```

行为概览：

1. **模块初始化阶段**：
   - NICOT 会扫描所有实体上带 `QueryFullText` 的字段；
   - 为这些字段生成必要的 extension / configuration / index。
2. **GET 查询阶段**：
   - 当 Query DTO 上该字段有值时：
     - 追加全文搜索条件；
     - 如果 `orderBySimilarity: true`，则自动插入一个“相似度虚拟字段”到排序序列的最前面。

> 非 PostgreSQL 环境下，这个装饰器不保证可用。  
> 建议在你的项目文档中注明：**这些功能仅支持 PG**。

---

## 5. GetMutator：查询参数的 wire-format 转换

NICOT 支持为某些字段定义“GET 查询时的转换逻辑”，典型场景：

- 前端永远以 `string` 形式传参（`?tags=1,2,3`）；
- 控制器内希望拿到的已经是类型安全的结构（`number[]` / 自定义对象等）；
- OpenAPI 上依旧展示为 `string`，方便文档对齐 URL wire-format。

### 5.1 行为总结

当某个字段标记了类似 `getMutator` 的元数据时，NICOT 会：

1. 在 GET 的 Query DTO 生成阶段：
   - 将该字段在 OpenAPI 中标注为 `string` 类型；
   - 可以携带 `example` / `enum` / 其他描述字段；
   - 去除默认值（避免 Swagger 表单里自动填入默认 filter）。
2. 在真正进入 controller 之前：
   - 对整个 query DTO 做一次浅拷贝；
   - 针对所有声明过 `getMutator` 的字段：
     - 若值非空，调用对应 mutator，将 `string` 转换为目标结构；
   - 控制器收到的参数对象中，该字段就是“转换后”的类型。

你可以把它当成：

> “GET 查询参数 **永远按 string 形式传进来**，在进入 controller 前，NICOT 帮你做了一次类型转换；OpenAPI 上展示仍然以 string 为主。”

### 5.2 使用建议

- 适合以下模式：
  - `?ids=1,2,3` → 变成 `number[]`；
  - `?range=2024-01-01,2024-02-01` → 变成 `{ from: Date; to: Date }`；
  - `?country=us` → 映射到枚举类型。
- 一旦字段上启用了 mutator：
  - 请按“转换后的类型”来定义 DTO 字段类型；
  - 不要在控制器中再去自己 parse 字符串。

---

## 6. skipNonQueryableFields：只暴露“可用来过滤”的字段

在创建 `RestfulFactory` 时可以传入：

```ts
new RestfulFactory(Entity, {
  skipNonQueryableFields: true,
})
```

其效果：

- GET 查询 DTO（`findAllDto` / `findAllCursorPaginatedDto`）中：
  - **只会包含挂了查询装饰器（QueryCondition 系列）的字段**；
  - 其他字段（即使存在于实体中）不会出现在 Query DTO 里。
- 控制器入参解析时：
  - 所有“不在查询白名单”的 query 参数会被悄悄丢弃。

推荐使用场景：

- 对外开放的接口 / 多租户环境：
  - 打开 `skipNonQueryableFields`，让“可用来过滤的字段”显式白名单化。
- 内部调试接口：
  - 可以关闭该开关以获得更多灵活性（但需要自己约束哪些字段可以暴露）。

---

## 7. relations & @RelationComputed

### 7.1 relations 配置的双重角色

在 NICOT 中，“要不要联表查询”由两处配置共同影响：

1. **Factory / CrudService 的 `relations` 参数**：
   - 控制 Service 层是否在 SQL 中 join 这些 relations；
   - 也控制 `entityResultDto` / `entityCreateResultDto` 中是否保留这些字段。
2. **实体上的 `@RelationComputed()`**：
   - 用于声明：某个字段是通过 relations 计算得出；
   - 当你在 `relations` 里关闭某条链路时，可以避免递归计算此类字段，从而保证结果结构可控。

默认行为：

- 如果没有指定 `relations`：
  - Service 层不会自动 join 任何 relations（只查主表）；
  - Result DTO 中也会剔除所有 relations 字段。
- 当指定了 `relations`：
  - 例如 `['user', 'user.profile']`：
    - Service 只 join 这些链路；
    - Result DTO 只保留对应 relations 字段，其余 relations 自动剔除。

`@RelationComputed()` 适合以下场景：

- 某个字段依赖多级 relations 计算：
  - 例如 `post.user.profile.nickname`；
- 你希望通过 relations 配置剪枝时，不会错误地留下一个“失去依赖”的字段：
  - 这类字段应当在“被裁掉 relations”时也一起被排除，避免前端读到半残数据。

### 7.2 Service vs Factory 的 relations

- **Service**（CrudOptions）：
  - 控制 **查询层面**：join 哪些表、select 哪些列。
- **Factory**：
  - 除了影响查询，也影响 Result DTO 的字段结构和 Swagger 文档。

**推荐做法**：

- 不要在 Service 上随意单独写一套 relations；
- 统一通过 Factory 的 `relations` 管理，然后用 `Factory.crudService()` 生成 Service：
  - 这样 Service / Controller / DTO 在“数据结构”和“查询行为”上是一致的；
  - 避免“Service 查了，但 Result DTO 给你裁掉了”的不一致。

---

## 8. CrudService 选项 & 删除/导入行为

### 8.1 CrudOptions 回顾

```ts
interface CrudOptions<T> {
  relations?: (string | RelationDef)[];
  extraGetQuery?: (qb: SelectQueryBuilder<T>) => void;
  hardDelete?: boolean;
  createOrUpdate?: boolean;
  keepEntityVersioningDates?: boolean;
  outputFieldsToOmit?: (keyof T)[];
}
```

简要说明：

- `relations`：
  - 与第 7 节一致：决定 join 哪些 relations。
- `extraGetQuery`：
  - 所有 GET 操作（findOne / findAll / findAllCursorPaginated）都会在内部逻辑之后调用这个回调；
  - 你可以在这里统一追加“租户约束”等条件。
- `hardDelete`：
  - 默认：如果实体有 `deleteDateColumn`，优先 soft delete；否则 hard delete；
  - 设为 `true`：强制 hard delete（直接 `DELETE`）。
- `createOrUpdate`：
  - 为 `create()` 和批量导入提供“幂等写入行为”：
    - 同 id 记录不存在 → 插入；
    - 同 id 记录存在且未被软删除 → 更新；
    - 同 id 记录存在但已软删除 → 删除旧记录后插入新记录。
- `keepEntityVersioningDates`：
  - 控制是否在 Result DTO 中保留一些“版本字段/时间字段”；
  - 搭配 `getNotInResultFields()` 使用。
- `outputFieldsToOmit`：
  - 在 Result DTO 基础上再额外剔除一些字段（比实体上的 `NotInResult` 更细粒度）。

### 8.2 导入行为（importEntities）

`CrudBase.importEntities()` 的高层逻辑：

1. 将传入的“类实体对象”转成真正的实体实例（忽略 relations 字段）；
2. 对每个实体：
   - 调用 `isValidInCreate()`；
   - 若提供了 `extraChecking(ent)`，也会调用；
   - 收集所有不通过的记录，记录错误原因；
3. 对剩余的实体：
   - 执行 `beforeCreate()`；
   - 批量插入 / 更新（受 `createOrUpdate` 影响）；
   - 执行 `afterCreate()`；
4. 构造 ImportEntry DTO 列表：
   - 每条记录包含 `entry` + `result`（`OK` / 错误原因）；
   - 最终包在统一的 ReturnMessageDto 中返回。

导入的错误处理模式属于“部分成功”，而非事务式“要么全成，要么全失败”。

---

## 9. RestfulFactory API 细节

### 9.1 Options 回顾

```ts
interface RestfulFactoryOptions<T, O, W, C, U, F, R> {
  fieldsToOmit?: O[];
  writeFieldsToOmit?: W[];
  createFieldsToOmit?: C[];
  updateFieldsToOmit?: U[];
  findAllFieldsToOmit?: F[];
  outputFieldsToOmit?: R[];
  prefix?: string;
  keepEntityVersioningDates?: boolean;
  entityClassName?: string;
  relations?: (string | RelationDef)[];
  skipNonQueryableFields?: boolean;
}
```

要点：

- `entityClassName`：
  - 用于 DTO 的类名重命名，避免多 Factory 复用同一个实体时的命名冲突。
- `prefix`：
  - 影响所有自动生成路由的前缀：
    - 例如 `prefix: 'admin'` → `GET /admin`、`GET /admin/:id` 等。
- 其余字段与第 2 / 6 / 7 节的裁剪和 relations 逻辑一致，不再赘述。

### 9.2 自动生成的 DTO

Factory 自动生成以下 DTO 类型（以 `Post` 为例）：

- `PostFactory.createDto`：
  - `CreatePostDto`，用于 `POST` 创建；
- `PostFactory.updateDto`：
  - `UpdatePostDto`，用于 `PATCH` 更新；
- `PostFactory.findAllDto`：
  - `FindPostDto`，用于 offset 分页查询；
- `PostFactory.findAllCursorPaginatedDto`：
  - `FindPostCursorPaginatedDto`，用于 cursor 分页查询；
- `PostFactory.entityResultDto`：
  - `PostResultDto`，完整结果结构（包含 relations 白名单）；
- `PostFactory.entityCreateResultDto`：
  - `PostCreateResultDto`，创建时返回用的结果结构（通常剔除了 relations 和一些计算字段）。

在实际 Controller 中推荐写一个显式 class 派生，便于在代码里有强类型名可用，例如：

```ts
// post.factory.ts
export const PostFactory = new RestfulFactory(Post, {
  relations: ['user', 'comments'],
  skipNonQueryableFields: true,
});
```

```ts
// post.controller.ts
class FindAllPostDto extends PostFactory.findAllDto {}

@Controller('posts')
export class PostController {
  constructor(private readonly service: PostService) {}

  @PostFactory.findAll({ summary: 'List posts of current user' })
  async findAll(
    @PostFactory.findAllParam() dto: FindAllPostDto,
    @PutUser() user: User,              // 业务层装饰器，不属于 NICOT
  ) {
    // 通过 extraQuery 注入业务限制（例如按 userId 过滤）
    return this.service.findAll(dto, qb =>
      qb.andWhere('post.userId = :uid', { uid: user.id }),
    );
  }
}
```

> 最佳实践：Factory 独立放在 `*.factory.ts` 文件中，不和 Entity / Controller 写在一起，便于复用和阅读。

---

## 10. Cursor 分页：契约与边界

Cursor 分页由 NICOT 内部的一套工具实现，对使用者暴露的是：

- **入参**：在 Query DTO 上多了一个 `paginationCursor` 字段；
- **返回值**：统一封装在 `CursorPaginationReturnMessageDto` 中。

### 10.1 调用方式与返回结构

通过 Factory：

- `Factory.findAllCursorPaginated()` 作为装饰器；
- `Factory.findAllParam()` 自动生成包括 cursor 的 Query DTO。

返回结构（精简版）：

```ts
{
  statusCode: 200,
  success: true,
  message: 'success',
  data: T[],            // 本页数据
  pagination: {
    nextCursor?: string;
    previousCursor?: string;
  }
}
```

约定：

- 当 `nextCursor` 存在时，使用它作为下一次请求的 `paginationCursor` 可以向后翻页；
- 当 `previousCursor` 存在时，使用它作为 `paginationCursor` 可以向前翻页。

### 10.2 ORDER BY 的来源与约束

Cursor 分页的前提是：**当前查询有一个稳定的排序定义**。

排序来源包括：

1. 实体的 `applyQuery()`（如 IdBase 默认的按 id 排序）；
2. CrudOptions 中的 `extraGetQuery(qb)`；
3. Controller 调用 Service 时传入的 `extraQuery(qb)`。

**重要约束：**

- 使用同一个 cursor 链时，这些排序设置必须保持一致：
  - 如果第二页与第一页使用了不同的排序字段集合，cursor 内保存的“排序边界值”会和当前 SQL 不匹配；
  - NICOT 会尽量过滤掉不再存在的字段，但行为将退化为“不完全稳定的分页”，有可能出现重复或缺页。
- 你可以自由通过 `extraGetQuery / extraQuery` 覆盖默认排序，但建议：
  - 在一个用户的“翻页会话”中不要随意切换排序逻辑；
  - 如果切换了排序，请不要复用旧的 cursor，而是从头开始请求。

### 10.3 多字段排序下的 cursor 结构（概念层面）

NICOT 内部会将当前排序字段集合记为有序列表：

```ts
orderKeys = [
  '"post"."createdAt"',
  '"post"."id"',
  // ...可能还有更多，比如全文搜索时追加的“相似度虚拟列”
]
```

cursor 内部大致保存：

```ts
{
  type: 'next' | 'prev',
  payload: {
    '"post"."createdAt"': '2024-01-01T00:00:00.000Z',
    '"post"."id"': 123,
    // 其他排序字段...
  }
}
```

在下一次请求中：

- NICOT 会根据这些字段的排序方向、NULLS FIRST/LAST 等规则，
- 构造一个对等的 SQL 条件，语义类似：

```sql
(
  (createdAt > :createdAt)
  OR (createdAt = :createdAt AND id > :id)
  -- ...
)
```

同时对 `NULL` 的处理会根据排序方向做“是否在末尾”的判断，以尽量保证：

- 即使字段为 `NULL`，游标也不会无限循环或跳过。

你不需要直接操作这些 payload；只要当作不透明字符串使用即可。

### 10.4 “越界查询”与数据变动

**问题 1：解码 cursor 后，是否允许“越界查询”？**

- NICOT 不会阻止你使用任何字符串作为 cursor。
- 如果 WHERE 条件相比原来变得更严格：
  - 有可能直接得到空数组（即“你已经翻出边界”）。
- 如果 WHERE 条件相比原来更宽松：
  - 有可能出现“之前没见过的数据”出现在中间；
  - 或者部分数据重复出现在不同页。

**问题 2：数据在翻页过程中发生变化怎么办？**

- NICOT 不做快照；
- 换言之，cursor 分页和绝大多数线上服务一样，本质上只是一个“位置提示”：
  - 当数据整体集在翻页过程中被插入/删除/修改时，分页结果的稳定性自然会下降；
  - NICOT 不保证“无重复、无缺失”，仅在数据相对稳定时尽量做到“顺序一致”。

如果你的业务需要“强一致的分页体验”，建议结合：

- “固定时点快照”的业务设计；
- 或者在 cursor 中额外携带版本号 / 时间戳，在服务端主动拒绝跨版本 cursor。

---

## 11. PostgreSQL 特化能力汇总

以下能力目前主要针对 **PostgreSQL** 设计与优化：

- `QueryFullText`：
  - 使用 PG 的全文搜索设施（`to_tsvector`、`websearch_to_tsquery` 等）；
  - 自动维护 GIN 索引与 text search configuration。
- JSONB 相关查询装饰器：
  - 如基于 jsonb 的 `?` 运算符的等价封装。
- 各类针对 `jsonb` 列的 Column 装饰器。

在 MySQL / SQLite / 其他数据库环境下：

- 这些装饰器要么不可用，要么行为退化为普通字符串字段；
- 建议在你的项目说明中显式注明：**这些特性仅在 PostgreSQL 上启用**。

---

## 12. 手写 Controller / 自定义逻辑建议

### 12.1 推荐模式：Factory + CrudService

推荐使用方式：

1. 定义 Factory（独立文件）：

```ts
// post.factory.ts
export const PostFactory = new RestfulFactory(Post, {
  relations: ['user', 'comments'],
  skipNonQueryableFields: true,
});
```

2. 定义 Service（可选，也可组合自己的业务 Service）：

```ts
// post.service.ts
export class PostService extends PostFactory.crudService() {}
```

3. 在 Controller 中使用 Factory 的装饰器 + CrudService 的方法：

```ts
// post.controller.ts
class FindAllPostDto extends PostFactory.findAllDto {}

@Controller('posts')
export class PostController {
  constructor(private readonly service: PostService) {}

  @PostFactory.findAll({ summary: 'List posts of current user' })
  async findAll(
    @PostFactory.findAllParam() dto: FindAllPostDto,
    @PutUser() user: User,           // 业务装饰器，不属于 NICOT
  ) {
    return this.service.findAll(dto, qb =>
      qb.andWhere('post.userId = :uid', { uid: user.id }),
    );
  }
}
```

这样可以确保：

- DTO 自动生成（含 Query DTO / Result DTO）；
- Hook / 访问装饰器 / relations 剪枝 全部生效；
- Swagger 文档和真实 API 行为同步。

### 12.2 直接使用 TypeORM Repository 的注意事项

你当然可以在业务服务里直接注入 TypeORM `Repository<T>` 来做一些特殊查询，例如：

- 复杂统计；
- 聚合报表；
- 性能敏感的自定义 SQL。

需要注意的是：

- 这类查询 **不会** 自动触发 NICOT 的 Entity Hook；
- 也 **不会** 自动应用 `NotInResult` 之类的剪枝逻辑；
- 也不会自动使用 Factory 的 relations 白名单 / cursor 分页等能力。

如果你希望这类自定义逻辑与 NICOT 的行为对齐，可以考虑：

- 查询后手动调用 `CrudService.cleanEntityNotInResultFields()`；
- 或者包装成一个“内部 API”，与 NICOT 的公开 CRUD 分离。

---

以上就是 NICOT 的核心 API / 行为说明。  
更偏“哲学与入门”的内容，请参考 `README-CN.md`。
