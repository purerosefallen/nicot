# NICOT

**NICOT** is an entity-driven REST framework for **NestJS + TypeORM**.

You define an entity once, and NICOT generates:

- ORM columns (TypeORM)
- Validation rules (class-validator)
- Request DTOs (Create / Update / Query)
- RESTful endpoints + Swagger docs
- Unified response shape, pagination, relations loading

with **explicit, field-level control** over:

- what can be written
- what can be queried
- what can be returned

---

## Name & Philosophy

**NICOT** stands for:

- **N** — NestJS  
- **I** — **nesties** (the shared utility toolkit NICOT builds on)  
- **C** — class-validator  
- **O** — OpenAPI / Swagger  
- **T** — TypeORM  

The name also hints at **“nicotto”** / **“nicotine”**: something small that can be habit-forming. The idea is:

> **One entity definition becomes the contract for everything**  
> (DB, validation, DTO, OpenAPI, CRUD, pagination, relations).

NICOT’s design is:

- **Entity-driven**: metadata lives close to your domain model, not in a separate schema file.
- **Whitelist-first**: what can be queried or returned is **only** what you explicitly decorate.
- **AOP-like hooks**: lifecycle methods and query decorators let you inject logic without scattering boilerplate.

---

## Installation

```bash
npm install nicot @nestjs/config typeorm @nestjs/typeorm class-validator class-transformer reflect-metadata @nestjs/swagger
```

NICOT targets:

- NestJS ^9 / ^10 / ^11  
- TypeORM ^0.3.x

---

## Quick Start

### 1. Define your entity

```ts
import { Entity } from 'typeorm';
import {
  IdBase,
  StringColumn,
  IntColumn,
  BoolColumn,
  DateColumn,
  NotInResult,
  NotWritable,
  QueryEqual,
  QueryMatchBoolean,
} from 'nicot';

@Entity()
export class User extends IdBase() {
  @StringColumn(255, { required: true, description: 'User name' })
  @QueryEqual()
  name: string;

  @IntColumn('int', { unsigned: true })
  age: number;

  @BoolColumn({ default: true })
  @QueryMatchBoolean()
  isActive: boolean;

  @StringColumn(255)
  @NotInResult()
  password: string;

  @DateColumn()
  @NotWritable()
  createdAt: Date;

  isValidInCreate() {
    return this.age < 18 ? 'Minors are not allowed to register' : undefined;
  }

  isValidInUpdate() {
    return undefined;
  }
}
```

### 2. Create a RestfulFactory

Best practice: **one factory file per entity**.

```ts
// user.factory.ts
export const UserFactory = new RestfulFactory(User, {
  relations: [],             // explicitly loaded relations (for DTO + queries)
  skipNonQueryableFields: true, // query DTO = only fields with @QueryXXX
});
```

### 3. Service with CrudService

```ts
// user.service.ts
@Injectable()
export class UserService extends UserFactory.crudService() {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }
}
```

### 4. Controller using factory-generated decorators

```ts
// user.controller.ts
import { Controller } from '@nestjs/common';
import { PutUser } from '../auth/put-user.decorator'; // your own decorator

// Fix DTO types up front
export class CreateUserDto extends UserFactory.createDto {}
export class UpdateUserDto extends UserFactory.updateDto {}
export class FindAllUserDto extends UserFactory.findAllDto {}

@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @UserFactory.create()
  async create(
    @UserFactory.createParam() dto: CreateUserDto,
    @PutUser() currentUser: User,
  ) {
    // business logic - attach owner
    dto.ownerId = currentUser.id;
    return this.service.create(dto);
  }

  @UserFactory.findAll()
  async findAll(
    @UserFactory.findAllParam() dto: FindAllUserDto,
    @PutUser() currentUser: User,
  ) {
    return this.service.findAll(dto, qb => {
      qb.andWhere('user.ownerId = :uid', { uid: currentUser.id });
    });
  }

  @UserFactory.findOne()
  async findOne(@UserFactory.idParam() id: number) {
    return this.service.findOne(id);
  }

  @UserFactory.update()
  async update(
    @UserFactory.idParam() id: number,
    @UserFactory.updateParam() dto: UpdateUserDto,
  ) {
    return this.service.update(id, dto);
  }

  @UserFactory.delete()
  async delete(@UserFactory.idParam() id: number) {
    return this.service.delete(id);
  }
}
```

Start the Nest app, and you get:

- `POST /users`
- `GET /users/:id`
- `GET /users`
- `PATCH /users/:id`
- `DELETE /users/:id`
- Optional `POST /users/import`

Documented in Swagger, with DTOs derived directly from your entity definition.

---

## Base ID classes: IdBase / StringIdBase

In NICOT you usually don’t hand-roll primary key fields. Instead you **inherit** one of the base classes.

### `IdBase()` — numeric auto-increment primary key

```ts
@Entity()
export class Article extends IdBase({ description: 'Article ID' }) {
  // id: number (bigint unsigned, primary, auto-increment)
}
```

Behavior:

- Adds `id: number` column (`bigint unsigned`, `primary: true`, `Generated('increment')`)
- Marks it as:
  - `@NotWritable()` — cannot be written via create/update DTO
  - `@IntColumn('bigint', { unsigned: true, ... })`
  - `@QueryEqual()` — usable as `?id=...` in GET queries
- By default, adds `ORDER BY id DESC` in `applyQuery` (you can override or disable with `noOrderById: true`)

### `StringIdBase()` — string / UUID primary key

```ts
@Entity()
export class ApiKey extends StringIdBase({
  uuid: true,
  description: 'API key ID',
}) {
  // id: string (uuid, primary)
}
```

Behavior:

- Adds `id: string` column
- When `uuid: true`:
  - `@UuidColumn({ primary: true, generated: true, ... })`
  - `@NotWritable()`
- When `uuid: false` or omitted:
  - `@StringColumn(length || 255, { required: true, ... })`
  - `@IsNotEmpty()` + `@NotChangeable()` (writable only at create time)
- Default ordering: `ORDER BY id ASC` (can be disabled via `noOrderById`)

Summary:

| Base class        | Type    | Default order | Generation strategy         |
|-------------------|---------|---------------|-----------------------------|
| `IdBase()`        | number  | `id DESC`     | auto increment (`bigint`)   |
| `StringIdBase()`  | string  | `id ASC`      | UUID or manual string       |

---

## Column decorators overview

NICOT’s `***Column()` decorators combine:

- **TypeORM column definition**
- **class-validator rules**
- **Swagger `@ApiProperty()` metadata**

Common ones:

| Decorator            | DB type             | Validation defaults         |
|----------------------|--------------------|-----------------------------|
| `@StringColumn(len)` | `varchar(len)`     | `@IsString()`, `@Length()`  |
| `@TextColumn()`      | `text`             | `@IsString()`               |
| `@UuidColumn()`      | `uuid`             | `@IsUUID()`                 |
| `@IntColumn(type)`   | integer types      | `@IsInt()`                  |
| `@FloatColumn(type)` | float/decimal      | `@IsNumber()`               |
| `@BoolColumn()`      | `boolean`          | `@IsBoolean()`              |
| `@DateColumn()`      | `timestamp`/date   | `@IsDate()`                 |
| `@JsonColumn(T)`     | `jsonb`            | `@IsObject()` / nested val. |
| `@SimpleJsonColumn`  | `json`             | same as above               |
| `@StringJsonColumn`  | `text` (stringified JSON) | same as above       |
| `@EnumColumn(Enum)`  | enum or text       | enum validation             |

All of them accept an `options` parameter:

```ts
@StringColumn(255, {
  required: true,
  description: 'Display name',
  default: 'Anonymous',
})
displayName: string;
```

---

## Access control decorators

These decorators control **where** a field appears:

- in create/update DTOs
- in query DTOs (GET)
- in response DTOs (`ResultDto`)

### Write / read restrictions

| Decorator         | Effect on DTOs                                            |
|-------------------|-----------------------------------------------------------|
| `@NotWritable()`  | Removed from both Create & Update DTO                    |
| `@NotCreatable()` | Removed from Create DTO only                             |
| `@NotChangeable()`| Removed from Update DTO only                             |
| `@NotQueryable()` | Removed from GET DTO (query params), can’t be used in filters |
| `@NotInResult()`  | Removed from all response DTOs (including nested relations) |

### Non-column & virtual fields

| Decorator            | Meaning                                                                 |
|----------------------|-------------------------------------------------------------------------|
| `@NotColumn()`       | Not mapped to DB; usually set in `afterGet()` as a computed field      |
| `@QueryColumn()`     | Only exists in query DTO (no DB column), used with `@QueryXXX()`       |
| `@RelationComputed(() => Class)` | Virtual field that depends on relations; participates in relation pruning |

Example:

```ts
@Entity()
export class User extends IdBase() {
  @StringColumn(255, { required: true })
  name: string;

  @StringColumn(255)
  @NotInResult()
  password: string;

  @DateColumn()
  @NotWritable()
  createdAt: Date;

  @NotColumn()
  @RelationComputed(() => Profile)
  profileSummary: ProfileSummary;
}
```

### Decorator priority (simplified)

When NICOT generates DTOs, it applies a **whitelist/cut-down** pipeline. Roughly:

- **Create DTO omits**:
  - `@NotColumn`
  - `@NotWritable`
  - `@NotCreatable`
  - factory options: `fieldsToOmit`, `writeFieldsToOmit`, `createFieldsToOmit`
  - relation fields (TypeORM relations are not part of simple create DTO)
- **Update DTO omits**:
  - `@NotColumn`
  - `@NotWritable`
  - `@NotChangeable`
  - factory options: `fieldsToOmit`, `writeFieldsToOmit`, `updateFieldsToOmit`
- **Query DTO (GET) omits**:
  - `@NotColumn`
  - `@NotQueryable`
  - fields that **require a GetMutator** but do not actually have one
- **Response DTO (`ResultDto`) omits**:
  - `@NotInResult`
  - factory `outputFieldsToOmit`
  - relation fields that are not in the current `relations` whitelist

In short:

> If you mark something as “not writable / queryable / in result”, that wins, regardless of column type or other decorators.

---

## Query decorators & QueryCondition

Query decorators define **how a field is translated into SQL** in GET queries.

Internally they all use a `QueryCondition` callback:

```ts
export const QueryCondition = (cond: QueryCond) =>
  Metadata.set(
    'queryCondition',
    cond,
    'queryConditionFields',
  ) as PropertyDecorator;
```

### Lifecycle in `findAll()` / `findAllCursorPaginated()`

When you call `CrudBase.findAll(ent)`:

1. NICOT creates a new entity instance.
2. Copies the DTO into it.
3. Calls `beforeGet()` (if present) — good place to adjust defaults.
4. Calls `entity.applyQuery(qb, alias)` — from your base class (e.g. `IdBase` adds `orderBy(id desc)`).
5. Applies relations joins (`relations` config).
6. Iterates over all fields with `QueryCondition` metadata and runs the conditions to mutate the `SelectQueryBuilder`.

So `@QueryXXX()` is a **declarative hook** into the query building stage.

### Built-in Query decorators

Based on `QueryWrap` / `QueryCondition`:

- Simple operators:
  - `@QueryEqual()`
  - `@QueryGreater()`, `@QueryGreaterEqual()`
  - `@QueryLess()`, `@QueryLessEqual()`
  - `@QueryNotEqual()`
  - `@QueryOperator('<', 'fieldName?')` for fully custom operators
- LIKE / search:
  - `@QueryLike()` (prefix match `field LIKE value%`)
  - `@QuerySearch()` (contains match `field LIKE %value%`)
- Boolean handling:
  - `@QueryMatchBoolean()` — parses `"true" / "false" / "1" / "0"`
- Arrays / IN:
  - `@QueryIn()` — `IN (...)`, supports comma-separated strings or arrays
  - `@QueryNotIn()` — `NOT IN (...)`
- Null handling:
  - `@QueryEqualZeroNullable()` — `0` (or `"0"`) becomes `IS NULL`, others `= :value`
- JSON:
  - `@QueryJsonbHas()` — Postgres `?` operator on jsonb field

All of these are high-level wrappers over the central abstraction:

```ts
export const QueryWrap = (wrapper: QueryWrapper, field?: string) =>
  QueryCondition((obj, qb, entityName, key) => {
    // ...convert obj[key] and call qb.andWhere(...)
  });
```

### Composing conditions: QueryAnd / QueryOr

You can combine multiple `QueryCondition` implementations:

```ts
export const QueryAnd = (...decs: PropertyDecorator[]) => { /* ... */ };
export const QueryOr = (...decs: PropertyDecorator[]) => { /* ... */ };
```

- `QueryAnd(A, B)` — run both conditions on the same field (AND).
- `QueryOr(A, B)` — build an `(A) OR (B)` bracket group.

These are useful for e.g. multi-column search or fallback logic.

### Full-text search: `QueryFullText`

PostgreSQL-only helper:

```ts
@StringColumn(255)
@QueryFullText({
  configuration: 'english',
  tsQueryFunction: 'websearch_to_tsquery',
  orderBySimilarity: true,
})
content: string;
```

NICOT will:

- On module init, create needed text search configuration & indexes.
- For queries, generate `to_tsvector(...) @@ websearch_to_tsquery(...)`.
- Optionally compute a `rank` subject and order by it when `orderBySimilarity: true`.

> **Note:** full-text features are intended for **PostgreSQL**. On other databases they are not supported.

---

## GetMutator & MutatorPipe

GET query params are **always strings** on the wire, but entities may want richer types (arrays, numbers, JSON objects).

NICOT uses:

- `@GetMutator(...)` metadata on the entity field
- `MutatorPipe` to apply the conversion at runtime
- `PatchColumnsInGet` to adjust Swagger docs for GET DTOs

### Concept

1. Swagger/OpenAPI for GET shows the field as **string** (or string-based, possibly with example/enum from the mutator).
2. At runtime, `MutatorPipe` reads the string value and calls your mutator function.
3. The controller receives a **typed DTO** (e.g. array of numbers, parsed JSON) even though the URL carried strings.

### Example

```ts
@JsonColumn(SomeFilterObject)
@GetMutatorJson()         // parse JSON string from ?filter=...
@QueryOperator('@>')      // use jsonb containment operator
filter: SomeFilterObject;
```

Built-in helpers include:

- `@GetMutatorBool()`
- `@GetMutatorInt()`
- `@GetMutatorFloat()`
- `@GetMutatorStringSeparated(',')`
- `@GetMutatorIntSeparated()`
- `@GetMutatorFloatSeparated()`
- `@GetMutatorJson()`

Internally, `PatchColumnsInGet` tweaks Swagger metadata so that:

- Fields with GetMutator are shown as `type: string` (with `example` / `enum` if provided by the mutator metadata).
- Other queryable fields have their default value cleared (so GET docs don’t misleadingly show defaults).

And `RestfulFactory.findAllParam()` wires everything together:

- Applies `MutatorPipe` if GetMutators exist.
- Applies `OmitPipe(fieldsInGetToOmit)` to strip non-queryable fields.
- Optionally applies `PickPipe(queryableFields)` when `skipNonQueryableFields: true`.

---

## `skipNonQueryableFields`: only expose explicitly declared query fields

By default, `findAllDto` is:

- Entity fields minus:
  - `@NotColumn`
  - TypeORM relations
  - `@NotQueryable`
  - fields that require GetMutator but don’t have one
- Plus `PageSettingsDto`’s pagination fields (`pageCount`, `recordsPerPage`).

If you want GET queries to accept **only** fields that have `@QueryEqual()` / `@QueryLike()` / `@QueryIn()` etc, use:

```ts
const UserFactory = new RestfulFactory(User, {
  relations: [],
  skipNonQueryableFields: true,
});
```

Effects:

- `findAllDto` keeps only fields that:
  - have a `QueryCondition` (i.e. some `@QueryXXX()` decorator),
  - and are not in the omit list (`NotQueryable`, `NotColumn`, missing mutator).
- Swagger query params = exactly those queryable fields.
- At runtime, `findAllParam()` runs `PickPipe(queryableFields)`, so stray query params are dropped.

Mental model:

> “If you want a field to be filterable in GET `/users`, you **must** explicitly add a `@QueryXXX()` decorator. Otherwise it’s invisible.”

Recommended:

- For **admin / multi-tenant APIs** → turn `skipNonQueryableFields: true` ON.
- For **internal tools / quick debugging** → you can leave it OFF for convenience.

---

## Binding Context (Data Binding & Multi-Tenant Isolation)

In real systems, you often need to isolate data by *context*:

- current user
- current tenant / app
- current organization / project

Typical rules:

- A user can only see their own rows.
- Updates/deletes must be scoped by ownership.
- You don’t want to copy-paste `qb.andWhere('userId = :id', ...)` everywhere.

NICOT provides **BindingColumn / BindingValue / useBinding / beforeSuper** on top of `CrudBase` so that
*multi-tenant isolation* becomes part of the **entity contract**, not scattered per-controller logic.

---

### BindingColumn — declare “this field must be bound”

Use `@BindingColumn` on entity fields that should be filled and filtered by the backend context,
instead of coming from the client payload.

```ts
@Entity()
export class Article extends IdBase() {
  @BindingColumn()        // default bindingKey: "default"
  @IntColumn('int', { unsigned: true })
  userId: number;
  
  @BindingColumn('app')   // bindingKey: "app"
  @IntColumn('int', { unsigned: true })
  appId: number;
}
```

NICOT will:

- on `create`:
  - write binding values into `userId` / `appId` (if provided)
- on `findAll`:
  - automatically add `WHERE userId = :value` / `appId = :value`
- on `update` / `delete`:
  - add the same binding conditions, preventing cross-tenant access

Effectively: **binding columns are your “ownership / tenant” fields**.

---

### BindingValue — where the binding values come from

`@BindingValue` is placed on service properties or methods that provide the actual binding values.

```ts
@Injectable()
class ArticleService extends CrudService(Article) {
  constructor(@InjectRepository(Article) repo: Repository<Article>) {
    super(repo);
  }
  
  @BindingValue() // for BindingColumn()
  get currentUserId() {
    return this.ctx.userId;
  }
  
  @BindingValue('app') // for BindingColumn('app')
  get currentAppId() {
    return this.ctx.appId;
  }
}
```

At runtime, NICOT will:

- collect all `BindingValue` metadata
- build a partial entity `{ userId, appId, ... }`
- use it to:
  - fill fields on `create`
  - add `WHERE` conditions on `findAll`, `update`, `delete`

If both client payload and BindingValue provide a value, **BindingValue wins** for binding columns.

> You can use:
> - properties (sync)
> - getters
> - methods (sync)
> - async methods  
    > NICOT will await async BindingValues when necessary.

---

### Request-scoped context provider (recommended)

The “canonical” way to provide binding values in a web app is:

1. Extract context (user, app, tenant, etc.) from the incoming request.
2. Put it into a **request-scoped provider**.
3. Have `@BindingValue` simply read from that provider.

This keeps:

- context lifetime = request lifetime
- services as singletons
- binding logic centralized and testable

#### 1) Define a request-scoped binding context

Using `createProvider` from **nesties**, you can declare a strongly-typed request-scoped provider:

```ts
export const BindingContextProvider = createProvider(
  {
    provide: 'BindingContext',
    scope: Scope.REQUEST,                 // ⭐ one instance per HTTP request
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

Key points:

- `scope: Scope.REQUEST` → each request has its own context instance.
- `inject: [REQUEST, AuthService]` → you can pull anything you need to compute bindings.
- `createProvider` infers `(req, auth)` types automatically.

#### 2) Inject the context into your service and expose BindingValues

```ts
@Injectable()
class ArticleService extends CrudService(Article) {
  constructor(
    @InjectRepository(Article) repo: Repository<Article>,
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

With this setup:

- each request gets its own `{ userId, appId }` context
- `@BindingValue` simply reads from that context
- `CrudBase` applies bindings for create / findAll / update / delete automatically
- controllers do **not** need to repeat `userId` conditions

This is the **recommended** way to use binding in a NestJS HTTP app.

---

### useBinding — override binding per call

For tests, scripts, or some internal flows, you may want to override binding values *per call*
instead of relying on `@BindingValue`.

Use `useBinding` for this:

```ts
// create with explicit binding
const res = await articleService
  .useBinding(7)           // bindingKey: "default"
  .useBinding(44, 'app')   // bindingKey: "app"
  .create({ name: 'Article 1' });

// query in the same binding scope
const list = await articleService
  .useBinding(7)
  .useBinding(44, 'app')
  .findAll({});
```

Key properties:

- override is **per call**, not global
- multiple concurrent calls with different `useBinding` values are isolated
- merges with `@BindingValue` (explicit `useBinding` can override default BindingValue)

This is particularly handy in unit tests and CLI scripts.

---

### beforeSuper — safe overrides with async logic (advanced)

`CrudService` subclasses are singletons, but bindings are *per call*.

If you override `findAll` / `update` / `delete` and add `await` **before** calling `super`,
you can accidentally mess with binding order / concurrency.

NICOT offers `beforeSuper` as a small helper:

```ts
@Injectable()
class SlowArticleService extends ArticleService {
  override async findAll(
    ...args: Parameters<typeof ArticleService.prototype.findAll>
  ) {
    await this.beforeSuper(async () => {
      // any async work before delegating to CrudBase
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    return super.findAll(...args);
  }
}
```

What `beforeSuper` ensures:

1. capture (freeze) current binding state
2. run your async pre-logic
3. restore binding state
4. continue into `CrudBase` with the correct bindings

This is an **advanced** hook; most users don’t need it. For typical per-request isolation, prefer request-scoped context + `@BindingValue`.

---

### How Binding works inside CrudBase

On each CRUD operation, NICOT does roughly:

1. collect `BindingValue` from the service (properties / getters / methods / async methods)
2. merge with `useBinding(...)` overlays
3. build a “binding partial entity”
4. apply it to:
  - `create`: force binding fields
  - `findAll` / `update` / `delete`: add binding-based `WHERE` conditions
5. continue with:
  - `beforeGet` / `beforeUpdate` / `beforeCreate`
  - query decorators (`@QueryXXX`)
  - pagination
  - relations

You can think of Binding as **“automatic ownership filters”** configured declaratively on:

- entities (`@BindingColumn`)
- services (`@BindingValue`, `useBinding`, `beforeSuper`, request-scoped context)

---

## Upsert: Idempotent Write by Conflict Keys (PUT /resource)

Upsert is NICOT’s idempotent write primitive. Given a set of conflict keys, NICOT will insert a new row if no existing row matches, or update the matched row if it already exists.

Unlike create or update, upsert is a first-class operation with its own semantics:
- It does not reuse create/update DTO rules by default.
- It does not rely on create/update lifecycle hooks.
- It uses explicitly declared upsert keys.
- It integrates with Binding to remain multi-tenant safe.

---

### 1) Declaring conflict keys with `@UpsertColumn`

`@UpsertColumn()` marks entity fields that participate in the upsert conflict key (often called a “natural key”).

Example: upserting an article by `slug`.

```ts
import { Entity } from 'typeorm';
import { IdBase, StringColumn } from 'nicot';
import { UpsertColumn, UpsertableEntity } from 'nicot';

@Entity()
@UpsertableEntity()
export class Article extends IdBase() {
  @UpsertColumn()
  @StringColumn(64, { required: true, description: 'Unique slug per tenant' })
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

Notes:
- Upsert is whitelist-based: only fields decorated with `@UpsertColumn()` can be used as conflict keys.
- Validation is upsert-specific via `isValidInUpsert()`, parallel to `isValidInCreate()` and `isValidInUpdate()`.

---

### 2) Enabling upsert with `@UpsertableEntity`

`@UpsertableEntity()` marks an entity as upsert-capable and enforces structural correctness.

It guarantees that:
- the entity defines at least one `UpsertColumn` or `BindingColumn` (or has an upsert-capable base id)
- the effective conflict key is backed by a database-level UNIQUE constraint

This aligns with PostgreSQL’s requirement for:

`INSERT ... ON CONFLICT (...) DO UPDATE`

where the conflict target must match a unique index or unique constraint (the primary key also qualifies).

In practice, NICOT builds uniqueness from:

- all `@UpsertColumn()` fields
- all `@BindingColumn()` fields

unless the conflict key degenerates to the primary key alone.

---

### 3) `StringIdBase()` and upsert keys (UUID vs manual)

NICOT provides `StringIdBase()` as the string-primary-key base.

- `StringIdBase({ uuid: true })`
  - id is generated by the DB
  - id is not client-writable
  - upsert keys should usually be explicit natural keys via `@UpsertColumn()` (and possibly binding columns)

- `StringIdBase({ uuid: false })` (or omitted)
  - id is client-provided and required
  - id is effectively the natural key
  - upsert can conflict on `id` alone, meaning this mode behaves as if `id` is an upsert key out of the box

This is important when you combine `id` with additional `@UpsertColumn()` fields:
- If your conflict key includes both `id` and another field (e.g. `slug`), then `id` differs but `slug` matches should be treated as a different row (because the conflict key is the full tuple).
- If you instead want “slug decides identity” independent of `id`, do not include `id` in the conflict key.

(Which key set is used is determined by your upsert columns + binding columns + base id behavior.)

---

### 4) Upsert and Binding (multi-tenant safety)

When Binding is used, binding columns automatically participate in the upsert conflict key.

```ts
import { Entity } from 'typeorm';
import { IdBase, IntColumn, StringColumn } from 'nicot';
import { BindingColumn, BindingValue } from 'nicot';
import { UpsertColumn, UpsertableEntity } from 'nicot';
import { Injectable } from '@nestjs/common';
import { CrudService } from 'nicot';
import { InjectRepository } from '@nestjs/typeorm';

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

Effective conflict key:
- appId (binding)
- slug (upsert column)

This ensures:
- upsert never matches or overwrites rows belonging to another tenant
- tenant isolation is enforced declaratively at the entity level

---

### 5) Exposing upsert in controllers (PUT /resource)

Upsert is exposed as a PUT request on the resource root path.

Factory definition:

```ts
import { RestfulFactory } from 'nicot';

export const ArticleFactory = new RestfulFactory(TenantArticle, {
  relations: ['author'],
  upsertIncludeRelations: true,
  skipNonQueryableFields: true,
});
```

Service:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ArticleService extends ArticleFactory.crudService() {
  constructor(@InjectRepository(TenantArticle) repo) {
    super(repo);
  }
}
```

Controller:

```ts
import { Controller } from '@nestjs/common';

export class UpsertArticleDto extends ArticleFactory.upsertDto {}

@Controller('articles')
export class ArticleController {
  constructor(private readonly service: ArticleService) {}

  // PUT /articles
  @ArticleFactory.upsert()
  upsert(@ArticleFactory.upsertParam() dto: UpsertArticleDto) {
    return this.service.upsert(dto);
  }
}
```

---

### 6) Response shape and relations

Upsert returns NICOT’s standard response envelope.

When `upsertIncludeRelations` is enabled, NICOT will:
- refetch the saved entity using a query builder
- apply relation joins based on the factory’s `relations` whitelist
- return a fully hydrated entity in the response

When disabled, upsert returns only the entity’s own columns, which is usually faster and avoids unnecessary joins.

---

### 7) Soft delete behavior

All NICOT base entities include a soft-delete column (`deleteTime`).

If an upsert matches a row that is currently soft-deleted:
- NICOT sets `deleteTime` to `null` during upsert
- refetches the row using `withDeleted()`
- performs an explicit restore if necessary

This makes upsert fully idempotent even across delete–recreate cycles.

---

### 8) Recommended usage patterns

- Use stable natural keys (`slug`, `code`, `externalId`) as upsert columns.
- Combine upsert columns with binding columns for multi-tenant uniqueness.
- Keep upsert validation logic inside `isValidInUpsert()`.
- For `StringIdBase({ uuid: false })`, treat `id` as the natural key by default; add extra upsert columns only when you explicitly want a composite identity.

---

## Pagination

### Offset pagination (default)

Every `findAll()` uses **offset pagination** via `PageSettingsDto`:

- Query fields:
  - `pageCount` (1-based)
  - `recordsPerPage` (default 25)
- Internally:
  - Applies `.take(recordsPerPage).skip((pageCount - 1) * recordsPerPage)`

If your entity extends `PageSettingsDto`, it can control defaults by overriding methods like `getRecordsPerPage()`.

You can also effectively “disable” pagination for specific entities by returning a large value:

```ts
@Entity()
export class LogEntry extends IdBase() {
  // ...

  getRecordsPerPage() {
    return this.recordsPerPage || 99999;
  }
}
```

### Cursor pagination

NICOT also supports **cursor-based pagination** via:

- `CrudBase.findAllCursorPaginated()`
- `RestfulFactory.findAllCursorPaginatedDto`
- `entityCursorPaginationReturnMessageDto`

Usage sketch:

```ts
class FindAllUserCursorDto extends UserFactory.findAllCursorPaginatedDto {}

@UserFactory.findAllCursorPaginated()
async findAll(
  @UserFactory.findAllParam() dto: FindAllUserCursorDto,
) {
  return this.service.findAllCursorPaginated(dto);
}
```

Notes:

- Offset vs cursor pagination share the same query decorators and entity metadata.
- You choose one mode per controller route (`paginateType: 'offset' | 'cursor' | 'none'` in `baseController()`).
- Cursor payload and multi-column sorting behavior are documented in more detail in the API reference.

---

## CrudBase & CrudService

`CrudBase<T>` holds the core CRUD and query logic:

- `create(ent, beforeCreate?)`
- `findOne(id, extraQuery?)`
- `findAll(dto?, extraQuery?)`
- `findAllCursorPaginated(dto?, extraQuery?)`
- `update(id, dto, cond?)`
- `delete(id, cond?)`
- `importEntities(entities, extraChecking?)`
- `exists(id)`
- `onModuleInit()` (full-text index loader for Postgres)

It honors:

- Relations configuration (`relations` → joins + DTO shape)
- `NotInResult` / `outputFieldsToOmit` in responses (`cleanEntityNotInResultFields()`)
- Lifecycle hooks on the entity:
  - `beforeCreate` / `afterCreate`
  - `beforeGet` / `afterGet`
  - `beforeUpdate` / `afterUpdate`
  - `isValidInCreate` / `isValidInUpdate` (return a string = validation error)

You usually don’t subclass `CrudBase` directly; instead you use:

```ts
export function CrudService<T extends ValidCrudEntity<T>>(
  entityClass: ClassType<T>,
  crudOptions: CrudOptions<T> = {},
) {
  return class CrudServiceImpl extends CrudBase<T> {
    constructor(repo: Repository<T>) {
      super(entityClass, repo, crudOptions);
    }
  };
}
```

And let `RestfulFactory` call this for you via `factory.crudService()`.

> You can still use TypeORM’s repository methods directly in **custom business methods**, but when you do, entity lifecycle hooks (`beforeGet()`, `afterGet()`, etc.) are not automatically applied. For NICOT-managed resources, prefer going through `CrudBase` when you want its behavior.

---

## RestfulFactory: DTO & Controller generator

`RestfulFactory<T>` is the heart of “entity → DTOs → controller decorators” mapping.

### Options

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

Key ideas:

- **relations**: both for:
  - which relations are eager-loaded and exposed in DTO,
  - and which joins are added to queries.
- **outputFieldsToOmit**: extra fields to drop from response DTOs (in addition to `@NotInResult`).
- **prefix**: extra path prefix for controller decorators (e.g. `v1/users`).
- **skipNonQueryableFields**: described above.

### Auto-generated DTOs

For a factory:

```ts
export const UserFactory = new RestfulFactory(User, { relations: [] });
```

NICOT gives you:

- `UserFactory.createDto`
- `UserFactory.updateDto`
- `UserFactory.findAllDto`
- `UserFactory.findAllCursorPaginatedDto`
- `UserFactory.entityResultDto`
- `UserFactory.entityCreateResultDto`
- `UserFactory.entityReturnMessageDto`
- `UserFactory.entityCreateReturnMessageDto`
- `UserFactory.entityArrayReturnMessageDto`
- `UserFactory.entityCursorPaginationReturnMessageDto`

Recommended usage:

```ts
export class CreateUserDto extends UserFactory.createDto {}
export class UpdateUserDto extends UserFactory.updateDto {}
export class FindAllUserDto extends UserFactory.findAllDto {}
export class UserResultDto extends UserFactory.entityResultDto {}
```

This keeps types stable and easy to re-use in custom endpoints or guards.

### Controller decorators & params

Each factory exposes decorators that match CRUD methods:

- `create()` + `createParam()`
- `findOne()` + `idParam()`
- `findAll()` / `findAllCursorPaginated()` + `findAllParam()`
- `update()` + `updateParam()`
- `delete()`
- `import()` (`POST /import`)

These decorators stack:

- HTTP method + path (optionally prefixed)
- Swagger operation and response schemas (using the generated DTOs)
- Validation & transform pipes (through DataPipe / OptionalDataPipe / OmitPipe / MutatorPipe)

Example (revised):

```ts
// post.factory.ts
export const PostFactory = new RestfulFactory(Post, {
  relations: [], // no relations for this resource
});

// post.service.ts
@Injectable()
export class PostService extends PostFactory.crudService() {
  constructor(@InjectRepository(Post) repo: Repository<Post>) {
    super(repo);
  }
}

// post.controller.ts
import { PutUser } from '../common/put-user.decorator';

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

### `baseController()` shortcut

If you don’t have extra logic, you can generate a full controller class:

```ts
@Controller('users')
export class UserController extends UserFactory.baseController({
  paginateType: 'offset', // 'offset' | 'cursor' | 'none'
  globalMethodDecorators: [],
  routes: {
    import: { enabled: false }, // disable /import
  },
}) {
  constructor(service: UserService) {
    super(service);
  }
}
```

- If **any** route in `routes` has `enabled: true`, then **only** explicitly enabled routes are generated.
- Otherwise, all routes are generated except ones marked `enabled: false`.

This is useful for quickly bootstrapping admin APIs, then selectively disabling / overriding certain endpoints.

---

## Relations & RelationComputed

Relations are controlled by:

- TypeORM decorators on the entity: `@ManyToOne`, `@OneToMany`, etc.
- NICOT’s `relations` whitelist in:
  - `RestfulFactory` options
  - `CrudOptions` for `CrudService` / `CrudBase`

Example:

```ts
@Entity()
export class User extends IdBase() {
  @OneToMany(() => Article, article => article.user)
  articles: Article[];
}

@Entity()
export class Article extends IdBase() {
  @ManyToOne(() => User, user => user.articles)
  user: User;
}
```

If you configure:

```ts
export const UserFactory = new RestfulFactory(User, {
  relations: ['articles'],
});
```

Then:

- `UserResultDto` includes `articles` but not `articles.user` (no recursive explosion).
- Query joins `user.articles` when using `findOne` / `findAll`.

### Virtual relation: `RelationComputed`

Sometimes you want a **computed field** that conceptually depends on relations, but is not itself a DB column.

Example:

```ts
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

export const MatchFactory = new RestfulFactory(Match, {
  relations: ['player1', 'player2', 'players'],
});
```

NICOT will:

- Treat `players` as a “computed relation” for pruning rules.
- Include `players` in the result DTO, but **not** recursively include all fields from `Participant.matches1`/`matches2` etc.
- This keeps DTOs from blowing up due to cyclic relations.

---

## Unified response shape

NICOT uses a uniform wrapper for all responses:

```ts
{
  statusCode: number;
  success: boolean;
  message: string;
  timestamp?: string;
  data?: any;
}
```

Types are built via generics:

- `ReturnMessageDto(Entity)` — single payload
- `PaginatedReturnMessageDto(Entity)` — with `total`, `totalPages`, etc.
- `CursorPaginationReturnMessageDto(Entity)` — with `nextCursor`, `previousCursor`
- `BlankReturnMessageDto` — for responses with no data

And correspondingly in `RestfulFactory`:

- `entityReturnMessageDto`
- `entityCreateReturnMessageDto`
- `entityArrayReturnMessageDto`
- `entityCursorPaginationReturnMessageDto`

You can still build custom endpoints and return these wrappers manually if needed.

---

## Transactional TypeORM (request-scoped transactions)

NICOT’s CRUD flows are TypeORM-based, but by default each repository call is not automatically wrapped in a single database transaction.

If you want **“one HTTP request = one DB transaction”**, NICOT provides a small TypeORM wrapper:

- `TransactionalTypeOrmInterceptor()` — starts a TypeORM transaction at the beginning of a request and commits or rolls it back when request processing finishes or fails.
- `TransactionalTypeOrmModule.forFeature(...)` — provides **request-scoped** transaction-aware `EntityManager` / `Repository` injection tokens, and also includes the TypeORM `forFeature()` import/export.

### When to use

Use transactional mode when you want:

- multiple writes across different repositories to **commit/rollback together**
- service methods that mix `create/update/delete` and custom repo operations
- deterministic rollback when you throw `BlankReturnMessageDto(...).toException()`

Avoid it for:

- streaming responses (SSE / long-lived streams) — the transaction would stay open until the stream completes
- very heavy read-only endpoints where a transaction adds overhead

### 1) Import TransactionalTypeOrmModule

In the module that owns your resource:

```ts
import { Module } from '@nestjs/common';
import { User } from './user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

import { TransactionalTypeOrmModule } from 'nicot'; // or your local path

@Module({
  imports: [
    // ⭐ includes TypeOrmModule.forFeature([User]) internally and re-exports it
    TransactionalTypeOrmModule.forFeature([User]),
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

Notes:

- The providers created by `TransactionalTypeOrmModule.forFeature(...)` are `Scope.REQUEST`.
- You still need a `TypeOrmModule.forRoot(...)` (or equivalent) at app root to configure the DataSource.

### 2) Enable TransactionalTypeOrmInterceptor() for the controller

Apply the interceptor to ensure a transaction is created for each HTTP request:

```
import { Controller, UseInterceptors } from '@nestjs/common';
import { RestfulFactory } from 'nicot';
import { User } from './user.entity';
import { TransactionalTypeOrmInterceptor } from 'nicot';

export const UserFactory = new RestfulFactory(User);

@Controller('users')
@UseInterceptors(TransactionalTypeOrmInterceptor())
export class UserController extends UserFactory.baseController() {
  constructor(service: UserService) {
    super(service);
  }
}
```

Behavior:

- Transaction begins before controller handler runs.
- Transaction commits when the returned Observable completes.
- Transaction rolls back when the Observable errors (including thrown HTTP exceptions).

### 3) Inject Transactional Repository / EntityManager in services

To actually use the transaction context, inject the transactional repo/em instead of the default TypeORM ones.

#### Transactional repository (recommended)

```ts
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RestfulFactory } from 'nicot';
import { InjectTransactionalRepository } from 'nicot';
import { User } from './user.entity';

export const UserFactory = new RestfulFactory(User);

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

Now all NICOT CRUD operations (`create/findAll/update/delete/import`) will run using the transaction-bound repository when the interceptor is active.

#### Transactional entity manager (advanced)

```ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InjectTransactionalEntityManager } from 'nicot';

@Injectable()
export class UserTxService {
  constructor(
    @InjectTransactionalEntityManager()
    private readonly em: EntityManager,
  ) {}

  async doSomethingComplex() {
    // this.em is transaction-bound when interceptor is active
  }
}
```

### Rollback example (404)

If you throw a NICOT exception after writing, the transaction will roll back:

```ts
@Post('fail')
async fail() {
  await this.service.repo.save({ name: 'ROLL' } as any);
  throw new BlankReturnMessageDto(404, 'message').toException();
}
```

Expected:

- HTTP response is `404`
- database changes are not committed (rollback)

---

## Operation: Atomic business logic on a single entity

NICOT provides an **`operation` abstraction** for implementing
**atomic, row-level business logic** on top of a `CrudService`.

This abstraction exists on **two different layers**:

1. **Service layer**: `CrudService.operation()`
2. **Controller layer**: `RestfulFactory.operation()`

They are designed to be **orthogonal**:
- the service operation **executes domain logic**
- the factory operation **exposes it as an HTTP endpoint**

You may use either one independently, or combine them.

---

### Service-level operation (`CrudService.operation()`)

#### What it does

`CrudService.operation()` executes a callback with:

- a **row-level write lock** on the target entity
- a transactional repository (unless one is explicitly provided)
- automatic **change tracking and flushing**
- full compatibility with NICOT binding (`@BindingColumn`, `@BindingValue`)

Internally, it follows this lifecycle:

1. Resolve binding values (tenant / owner isolation)
2. Check entity existence
3. Open a transaction (unless `options.repo` is provided)
4. Load the entity with `pessimistic_write` lock
5. Snapshot column values
6. Run user callback
7. Flush only changed columns
8. Commit or rollback

---

#### Basic usage (inside a service)

```ts
@Injectable()
class UserService extends UserFactory.crudService() {
  async disableUser(id: number) {
    return this.operation(id, async (user) => {
      user.isActive = false;
    });
  }
}
```

Return behavior:

- callback returns `void | undefined | null`  
  → `BlankReturnMessageDto(200, 'success')`
- callback returns a value  
  → `GenericReturnMessageDto(200, 'success', value)`

---

#### Returning business data

```ts
async disableAndReport(id: number) {
  return this.operation(id, async (user) => {
    user.isActive = false;
    return { disabled: true };
  });
}
```

---

#### Error handling & rollback

Any exception thrown inside the callback causes a rollback.

```ts
async dangerousOperation(id: number) {
  return this.operation(id, async () => {
    throw new BlankReturnMessageDto(403, 'Forbidden').toException();
  });
}
```

---

#### Binding-aware by default

`operation()` never bypasses NICOT binding rules.

If your entity has:

```ts
@BindingColumn()
userId: number;
```

and your service defines:

```ts
@BindingValue()
get currentUserId() {
  return this.ctx.userId;
}
```

then `operation()` will automatically:

- restrict existence checks
- restrict row locking
- restrict updates

to the current binding scope.

---

#### Using `options.repo` (integration with transactional interceptors)

By default, `operation()` opens its own transaction.

If you pass a repository via `options.repo`,
**no new transaction will be created**.

This is intended for integration with
`TransactionalTypeOrmModule` and `TransactionalTypeOrmInterceptor`.

```ts
@Injectable()
class UserService extends UserFactory.crudService() {
  constructor(
    @InjectTransactionalRepository(User)
    private readonly repo: Repository<User>,
  ) {
    super(repo);
  }

  async updateInsideRequestTransaction(id: number) {
    return this.operation(
      id,
      async (user) => {
        user.name = 'Updated in request transaction';
      },
      {
        repo: this.repo,
      },
    );
  }
}
```

This allows:

- request-wide transactions
- consistent behavior across multiple service calls
- zero coupling between business logic and infrastructure

---

### Controller-level operation (`RestfulFactory.operation()`)

#### What it does (and what it does NOT)

`RestfulFactory.operation()` **does not implement any business logic**.

It only:

- declares an HTTP endpoint
- wires Swagger metadata
- standardizes request / response shape
- delegates execution to your service method

Think of it as **a declarative endpoint generator**, not an executor.

---

#### Declaring an operation endpoint

```ts
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UserFactory.operation('disable')
  async disable(@UserFactory.idParam() id: number) {
    return this.userService.disableUser(id);
  }
}
```

This generates:

- `POST /users/:id/disable`
- Swagger operation summary
- standardized NICOT response envelope

---

#### Returning custom data

```ts
@UserFactory.operation('reset-password', {
  returnType: ResetPasswordResultDto,
})
async resetPassword(@UserFactory.idParam() id: number) {
  return this.userService.resetPassword(id);
}
```

---

### Combining both layers (recommended pattern)

The **recommended pattern** is:

- put **all business logic** in `CrudService.operation()`
- expose it via `RestfulFactory.operation()`

This gives you:

- reusable domain logic
- testable service methods
- thin, declarative controllers

```ts
@Injectable()
class UserService extends UserFactory.crudService() {
  async disableUser(id: number) {
    return this.operation(id, async (user) => {
      user.isActive = false;
    });
  }
}

@Controller('users')
class UserController {
  constructor(private readonly userService: UserService) {}

  @UserFactory.operation('disable')
  disable(@UserFactory.idParam() id: number) {
    return this.userService.disableUser(id);
  }
}
```

---

### Design philosophy

- `operation()` is **not** a CRUD replacement
- it is **not** a generic transaction wrapper
- it is a **domain-oriented mutation primitive**

In NICOT:

> **CRUD is declarative**  
> **Operations express intent**

---

## Best practices

- **One factory per entity**, in its own `*.factory.ts` file.  
  - Keeps entity, factory, service, controller decoupled but aligned.
- Let **entities own the contract**:
  - Column types
  - Validation
  - Access control (`@NotWritable`, `@NotInResult`, `@NotQueryable`)
  - Query capabilities (`@QueryXXX`)
- For list APIs, strongly consider:
  - `skipNonQueryableFields: true`
  - `@QueryXXX` only on fields you really want public filtering on.
- Prefer `CrudService` / `CrudBase` for NICOT-managed resources, so:
  - lifecycle hooks are honored,
  - relations + “not in result” logic stay consistent.
- Use raw TypeORM repository methods only for clearly separated custom flows, and treat them as “outside NICOT”.

---

## License

MIT
