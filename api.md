# NICOT API Reference

> This document is a **high-level API / behavioral reference** for NICOT.  
> It assumes you’ve already skimmed the main README and want more “how it really behaves” details.

---

## 0. Terminology

- **Entity / model**: TypeORM entity class. In NICOT this is the *single source of truth* (fields, validation, query options are all declared here).
- **Factory**: An instance of `new RestfulFactory(Entity, options)`.
- **CrudService**: A service class created by `Factory.crudService()`.
- **BaseRestfulController**: The base controller used by `Factory.baseController()`.
- **Query DTO**: `findAllDto` / `findAllCursorPaginatedDto`.
- **Result DTO**: `entityResultDto` / `entityCreateResultDto`.

We use `T` below to represent the TypeScript type of an entity.

---

## 1. Base ID classes & entity hooks

### 1.1 IdBase / StringIdBase behavior

**IdBase(idOptions?: { description?: string; noOrderById?: boolean; })**

- Field:
  - `id: number`
  - DB column: `bigint unsigned`, primary, auto-increment
- Default ordering:
  - If `noOrderById !== true`, `applyQuery()` will append:  
    `ORDER BY <alias>.id DESC`
- Validation / query:
  - Treated as “has default” (you don’t need to send it in Create);
  - Supports `?id=123` as an equality filter;
  - Not writable in Create/Update DTOs.

**StringIdBase(options: { length?: number; uuid?: boolean; noOrderById?: boolean; … })**

- Field:
  - `id: string` (primary)
- Behavior:
  - `uuid: true`:
    - Database generates UUID; Create/Update DTOs do **not** allow writing `id`.
  - `uuid: false / omitted`:
    - Fixed-length `varchar`, required on create, and **not changeable** later.
- Default ordering:
  - If `noOrderById !== true`, append:  
    `ORDER BY <alias>.id ASC`.

You can think of it as:

- **IdBase**: Auto-increment numeric primary key, newest first.
- **StringIdBase(uuid)**: String/UUID primary key, ordered lexicographically by default.

### 1.2 Entity hook lifecycle

An entity class may implement the following “convention-based” hooks, which NICOT’s CrudService will call:

- Validation:
  - `isValidInCreate(): string | undefined`
  - `isValidInUpdate(): string | undefined`
  - If they return a non-empty string → treated as error message and converted to a `400` response.
- Lifecycle:
  - `beforeCreate()`, `afterCreate()`
  - `beforeUpdate()`, `afterUpdate()`
  - `beforeGet()`, `afterGet()`
- Query extension:
  - `applyQuery(qb, entityAliasName)`  
    (IdBase / TimeBase use this to inject default ordering, etc. You can override it to customize.)

Rough order when doing a GET query:

1. Create instance `ent = new EntityClass()`
2. Assign Query DTO properties into `ent`
3. Call `ent.beforeGet?.()`
4. Call `ent.applyQuery(qb, alias)` (default ordering)
5. Apply relations (see section 7)
6. Apply field-level Query decorators
7. Apply pagination (offset or cursor)
8. Run SQL and get results
9. For each record, call `afterGet?.()`
10. Strip fields that should not appear in output (see section 2)

---

## 2. Access control decorators & field pruning

### 2.1 Access decorators overview

NICOT centralizes “where/when a field is visible or writable” using decorators plus Factory config.

Typical decorators:

| Decorator              | Affects stage(s)                         | Behavior                                                                 |
|------------------------|-------------------------------------------|--------------------------------------------------------------------------|
| `@NotWritable()`       | Create / Update                           | Field never appears in input DTOs                                        |
| `@NotCreatable()`      | Create                                    | Field is excluded from Create DTO only                                   |
| `@NotChangeable()`     | Update                                    | Field is excluded from Update DTO only                                   |
| `@NotQueryable()`      | GET Query DTO                             | Field is removed from query DTO (cannot be used as filter)               |
| `@NotInResult()`       | Result DTO                                | Field is removed from all response data (including nested relations)     |
| `@NotColumn()`         | DB mapping                                | Field is not mapped to a DB column, typically “computed” in `afterGet`   |
| `@QueryColumn()`       | GET Query DTO                             | Declares a “query-only” field (no DB column); usually combined with Query decorators |
| `@RelationComputed()`  | Result DTO / relation pruning             | Marks “computed from relations” fields to be pruned consistently with relations config |

NICOT reads these metadata in Factory / CrudService to decide:

- Which fields go into Create DTO
- Which fields go into Update DTO
- Which fields go into GET Query DTO
- Which fields are stripped from Result DTO

### 2.2 DTO pruning rules (priority)

Conceptually:

- **Create DTO**:
  - Remove:
    - All `NotColumn` fields
    - All relations
    - `NotWritable`, `NotCreatable`
    - Any fields explicitly omitted by Factory options
- **Update DTO**:
  - Remove:
    - All `NotColumn`
    - All relations
    - `NotWritable`, `NotChangeable`
    - Factory-level omissions
- **FindAll Query DTO**:
  - Remove:
    - All `NotColumn`
    - All relations
    - `NotQueryable`
    - Fields that declare “require mutator” but don’t actually have one
    - Factory-level omissions
- **Result DTO**:
  - Remove:
    - All “should not appear in result” fields (including some timestamp/version fields)
    - Factory `outputFieldsToOmit`
    - Relation fields that are not in the configured relations whitelist (see section 7)

A simple mental model:

> **For each stage (Create / Update / Query / Result), a field must be allowed by both decorators *and* Factory config to appear.**

As a user, you only need to:

- Put proper access decorators on each field;
- Optionally use Factory options (`fieldsToOmit`, `outputFieldsToOmit`, …) to fine-tune globally.

---

## 3. Query system: QueryCondition & QueryXXX

### 3.1 What QueryCondition does

`QueryCondition` is the underlying mechanism of all “Query” decorators. It describes:

> “When this field is present in the query DTO, how do we map it into SQL WHERE conditions?”

NICOT will, for each GET request:

1. Collect all fields in the entity that have QueryCondition metadata;
2. If the query DTO has a value for that field;
3. Run the associated condition logic and append to the `SelectQueryBuilder`.

It only affects **GET**:

- No impact on Create / Update / Delete.

### 3.2 Built-in wrappers

NICOT provides common “query templates” as decorators. A few examples:

- `QueryEqual()`:
  - `?status=1` → `status = :status`.
- `QueryLike()`:
  - `?name=ab` → `name LIKE 'ab%'`.
- `QuerySearch()`:
  - `?name=ab` → `name LIKE '%ab%'`.
- `QueryIn()`:
  - `?ids=1,2,3` or `?ids[]=1&ids[]=2` → `id IN (:...ids)`.
- `QueryNotIn()`:
  - Same as above, but `NOT IN`.
- `QueryMatchBoolean()`:
  - Interprets `true/false/1/0/'true'/'false'` as booleans, generates `= TRUE/FALSE`.
- `QueryEqualZeroNullable()`:
  - `?foo=0` or `?foo=0,0` → treat 0 as *NULL* and generate `IS NULL`; otherwise `=`.

All of these are “SQL expression templates” tied to decorators on fields.

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

Whenever these fields appear in the query DTO, NICOT translates them into the corresponding WHERE clauses.

### 3.3 Composition: QueryAnd / QueryOr

Sometimes you want **multiple** query behaviors on the same field, e.g.:

- A complex search that combines several conditions;
- A field that has more than one “matching strategy”.

NICOT gives you:

- `QueryAnd(A, B, C...)`:
  - Runs A, B, C in sequence and ANDs all their expressions.
- `QueryOr(A, B, C...)`:
  - Keeps internal AND-structure of each condition, and ORs them together.

Example (pseudo-code):

```ts
class Article {
  // Same field, two query behaviors. The final expression is A OR B.
  @QueryOr(QueryLike(), QueryEqual())
  title: string;
}
```

Think of them as:

- A / B are extracting logic from some existing Query decorators;
- `QueryAnd/QueryOr` just describe how we logically combine them.

---

## 4. PostgreSQL Full-Text Search (QueryFullText)

### 4.1 Use cases

`QueryFullText` is a specialized query decorator for **PostgreSQL**. It’s designed for:

- Marking certain text columns as “full-text searchable”;
- Letting the Query DTO support things like `?q=keywords`;
- Optionally sorting by `ts_rank` (relevance).

Capabilities:

- Automatically create full-text indexes (GIN + `to_tsvector(...)`);
- Automatically create/configure text search configurations (when a parser is specified, e.g. for Chinese);
- Query-side: generate `to_tsvector(...) @@ websearch_to_tsquery(...)` expressions;
- Optionally push a “relevance” virtual column to the front of the ORDER BY chain.

### 4.2 Configuration

Decorator shape (simplified):

```ts
class Article {
  @QueryFullText({
    // parser / configuration:
    // - `parser`: e.g. 'zhparser', NICOT will create a dedicated configuration
    // - or specify `configuration` directly, e.g. 'english'
    parser?: string;
    configuration?: string;

    // tsQuery function, default: 'websearch_to_tsquery'
    tsQueryFunction?: string;

    // Whether to order by similarity (ts_rank)
    orderBySimilarity?: boolean;
  })
  content: string;
}
```

Behavior overview:

1. **Module init**:
   - NICOT scans entities for fields annotated with `QueryFullText`;
   - For each such field:
     - Ensures required extension + configuration exist;
     - Creates appropriate GIN index on the table.
2. **GET query**:
   - If that field is present in the query DTO:
     - Adds a full-text condition;
     - If `orderBySimilarity: true`, inserts a virtual “rank” column at the front of ORDER BY to sort by relevance.

> This feature is intended for **PostgreSQL only**.  
> On other databases it is not guaranteed to work as expected.

---

## 5. GetMutator: wire-format to typed DTO

`GetMutator` (and related utilities) let you define a “wire-format to real type” conversion for GET query fields. Typical use cases:

- Frontend always sends parameters as strings (`?tags=1,2,3`);
- In controller, you want strongly-typed structures (`number[]`, custom objects, enums);
- In OpenAPI, the field is documented as `string`, matching the URL format.

### 5.1 Summary of behavior

If a field has registered “mutator metadata”, NICOT will:

1. **During GET Query DTO generation**:
   - Mark this field as `string` in OpenAPI;
   - Optionally provide `example`, `enum`, etc.;
   - Remove default values (to avoid Swagger auto-filling filters).
2. **Before entering the controller**:
   - Shallow-copy the query DTO;
   - For every field configured with a mutator:
     - If its value is non-null, call the mutator to convert the string into target structure;
   - The controller then receives the query object where that field is already converted to its “logical type”.

In other words:

> “GET query parameters always arrive as strings at the HTTP level, but NICOT runs a conversion layer before your controller, and your TypeScript DTO can safely use the converted type. OpenAPI still reflects the string wire format.”

### 5.2 Usage suggestions

Great for:

- `?ids=1,2,3` → `number[]`
- `?range=2024-01-01,2024-02-01` → `{ from: Date; to: Date }`
- `?country=us` → some enum type

Once a field is configured with a mutator:

- Define the DTO type as the *converted* type (e.g. `number[]`, not `string`);
- Do not manually parse string in the controller—let NICOT do it.

---

## 6. `skipNonQueryableFields`: strict filter white-list

When constructing a `RestfulFactory`, you may pass:

```ts
new RestfulFactory(Entity, {
  skipNonQueryableFields: true,
});
```

Effect:

- In GET Query DTOs (`findAllDto`, `findAllCursorPaginatedDto`):
  - **Only fields that have QueryCondition metadata are included**;
  - All other entity fields (even if they exist in the entity) are stripped from the query DTO.
- When parsing query parameters:
  - Any query param not present in the DTO will be silently dropped.

Where it shines:

- Public APIs / multi-tenant environments:
  - Turn this on, so your filterable fields are explicit whitelist.
- Internal tools:
  - You might leave it off for flexibility (while still using Query decorators to control behavior).

---

## 7. Relations & @RelationComputed

### 7.1 Dual role of `relations`

“Should we join this relation?” is controlled in two places:

1. **Factory / CrudService `relations` option**:
   - Controls which relations are joined in the SQL query;
   - Also controls which relations appear in `entityResultDto` / `entityCreateResultDto`.
2. **`@RelationComputed()` on entity fields**:
   - Declares fields that are derived *from* relations;
   - When the relation chain is pruned, NICOT can also consistently prune these computed fields.

Default behavior:

- If `relations` is **not** specified:
  - Service does not auto-join any relation (only the main table is queried);
  - Result DTO also drops all relation fields.
- If `relations` is specified:
  - Example: `['user', 'user.profile']`:
    - Service will join exactly those relation paths;
    - Result DTO includes relation fields along these paths only, others are pruned.

`@RelationComputed()` is useful when:

- A field depends on multiple relation chains:
  - for example, `post.user.profile.nickname`;
- You want NICOT to treat this field consistently with relation pruning:
  - If the underlying relations are not in the whitelist, this computed field should also be removed from Result DTO.

### 7.2 Service vs Factory `relations`

- **Service-level `relations` (CrudOptions)**:
  - Control actual SQL joins and selected columns.
- **Factory-level `relations`**:
  - Influence both query behavior and DTO structure / Swagger.

**Recommended pattern**:

- Don’t manually maintain a separate `relations` list only at Service level.
- Prefer to define `relations` on the Factory, and then derive Service via `Factory.crudService()`:
  - Ensures Service / Controller / DTO are aligned in:
    - Which relations are joined;
    - Which fields appear in responses.

---

## 8. CrudService options & import behavior

### 8.1 CrudOptions overview

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

Highlights:

- `relations`:
  - Same semantics as in section 7.
- `extraGetQuery`:
  - Applied on top of NICOT’s internal query logic for all GET operations (findOne / findAll / findAllCursorPaginated).
  - Ideal place to enforce “tenantId constraint”, “only active records”, etc.
- `hardDelete`:
  - Default: if the entity has a `deleteDateColumn`, soft delete is used; otherwise hard delete.
  - `hardDelete: true` forces `DELETE` even if soft delete is configured.
- `createOrUpdate`:
  - For `create()` and import:
    - If id does not exist → insert;
    - If id exists and not soft-deleted → update;
    - If id exists but soft-deleted → delete old row then insert new row.
- `keepEntityVersioningDates`:
  - Controls whether to keep some version/timestamp fields in Result DTO.
- `outputFieldsToOmit`:
  - Further excludes some fields from Result DTO, on top of `NotInResult` decorators.

### 8.2 Import behavior (`importEntities`)

High-level logic of `CrudBase.importEntities(...)`:

1. Normalize raw objects into entity instances (ignoring relation fields).
2. For each entity:
   - Call `isValidInCreate()`:
     - If it returns a message → record as invalid;
   - If provided, call `extraChecking(ent)`:
     - Use this for cross-row or external system validation.
3. Filter out invalid entities; keep errors in a list.
4. For remaining entities:
   - Call `beforeCreate()` on each;
   - Run a batch create (honoring `createOrUpdate`);
   - After saving, call `afterCreate()` on each.
5. Build ImportEntry DTO list:
   - Each record includes `entry` + `result` (“OK” or error message);
   - `entry` fields are cleaned via NICOT’s result-field pruning rules;
   - All entries are wrapped in a standard ReturnMessage response.

Import is “partially successful”: some entries may fail while others succeed, rather than “all-or-nothing”.

---

## 9. RestfulFactory API

### 9.1 Options recap

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

Key points:

- `entityClassName`:
  - Used to rename DTO classes; helps avoid name collisions when multiple Factories share one entity.
- `prefix`:
  - Affects all auto-generated routes:
    - e.g. `prefix: 'admin'` → `GET /admin`, `GET /admin/:id`, etc.
- All other fields hook into the pruning/relations behavior described in sections 2, 6, 7.

### 9.2 Generated DTOs

For a `Post` entity, a Factory will generate:

- `PostFactory.createDto`:
  - `CreatePostDto`, used for `POST`.
- `PostFactory.updateDto`:
  - `UpdatePostDto`, used for `PATCH`.
- `PostFactory.findAllDto`:
  - `FindPostDto`, used for offset-based GET pagination.
- `PostFactory.findAllCursorPaginatedDto`:
  - `FindPostCursorPaginatedDto`, used for cursor-based pagination.
- `PostFactory.entityResultDto`:
  - `PostResultDto`, full result structure (including allowed relations).
- `PostFactory.entityCreateResultDto`:
  - `PostCreateResultDto`, used for responses from `POST`:
    - Typically omits relations and certain computed fields.

In actual controllers, it’s recommended to define explicit classes extending these types, for clarity and stronger typings:

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
    @PutUser() user: User,      // business decorator, not from NICOT
  ) {
    return this.service.findAll(dto, qb =>
      qb.andWhere('post.userId = :uid', { uid: user.id }),
    );
  }
}
```

> Best practice: put each Factory in its own `*.factory.ts` file, separate from entity and controller, for reuse and readability.

---

## 10. Cursor pagination: contract & boundaries

Cursor pagination in NICOT is implemented internally, but from a user’s perspective it is:

- **Input**: an extra `paginationCursor` field in the Query DTO;
- **Output**: a `CursorPaginationReturnMessageDto` wrapping the data and cursor tokens.

### 10.1 Usage & response schema

Using Factory:

- Use `Factory.findAllCursorPaginated()` as method decorator;
- Use `Factory.findAllParam()` to get the combined Query DTO (including cursor).

Response (simplified):

```ts
{
  statusCode: 200,
  success: true,
  message: 'success',
  data: T[],              // current page
  pagination: {
    nextCursor?: string;
    previousCursor?: string;
  }
}
```

Contract:

- If `nextCursor` is present:
  - Send it in `paginationCursor` to get the next page.
- If `previousCursor` is present:
  - Send it in `paginationCursor` to get the previous page.

### 10.2 Source of ORDER BY and constraints

Cursor pagination **requires a stable ordering**.

Sorting can come from:

1. Entity’s `applyQuery()` (e.g. default `id` ordering from IdBase);
2. `extraGetQuery(qb)` from CrudOptions;
3. Controller’s `extraQuery(qb)` in each Service call.

Important constraints:

- Within the same cursor chain, all of these ordering sources must remain consistent:
  - If subsequent pages use a different set of ORDER BY fields, the cursor’s “boundary values” will not match the current query.
  - NICOT will try to ignore fields that no longer exist in ORDER BY, but the result degrades into less-stable pagination (duplicates / gaps may appear).
- You are free to use `extraGetQuery / extraQuery` to change the default ordering, but:
  - Avoid changing ordering mid-session while reusing cursors;
  - If you need a new ordering, treat it as a fresh pagination and ignore old cursors.

### 10.3 Multi-column ordering (conceptual)

Internally NICOT uses the current ordered columns as an ordered list:

```ts
orderKeys = [
  '"post"."createdAt"',
  '"post"."id"',
  // possibly other fields, e.g. full-text similarity
];
```

The cursor stores something conceptually like:

```ts
{
  type: 'next' | 'prev',
  payload: {
    '"post"."createdAt"': '2024-01-01T00:00:00.000Z',
    '"post"."id"': 123,
    // ...
  }
}
```

On the next request:

- NICOT reconstructs a WHERE clause:
  - Roughly equivalent to:
  
    ```sql
    (
      (createdAt > :createdAt)
      OR (createdAt = :createdAt AND id > :id)
      -- ...
    )
    ```
- It respects:
  - ASC / DESC;
  - `NULLS FIRST` / `NULLS LAST`;
  - And tries to handle `NULL` in a way that avoids infinite loops or broken boundaries.

You never need to manipulate the payload directly—treat the cursor as an opaque string.

### 10.4 Out-of-range & data changes

**Q1: What if I use an “out-of-range” cursor string?**

- NICOT does not restrict which string you send as `paginationCursor`.
- If the new WHERE conditions are stricter than before:
  - You may simply get an empty page (you “went past the end”).
- If they are looser:
  - You may see data that “wasn’t in the original window” appear in the middle;
  - Or see some rows repeated.

**Q2: What if data changes while I paginate?**

- NICOT does not create a snapshot of data.
- In a dynamic DB:
  - Inserts/deletes/updates during pagination are reflected immediately;
  - No guarantee of “no duplicates / no gaps”.
- Practically this is the same as many production APIs:
  - Cursor is a best-effort “position marker”, not a strong consistency guarantee.

If you require strongly consistent pagination:

- Consider:
  - Snapshots at the business-layer,
  - Or embedding extra version/timestamp into your own cursor scheme and rejecting cross-version cursors on the server.

---

## 11. PostgreSQL-specific features summary

NICOT has some features that are intentionally designed around **PostgreSQL**:

- `QueryFullText`:
  - Uses PG full-text tools (`to_tsvector`, `websearch_to_tsquery`, etc.);
  - Maintains GIN indexes & text search configurations.
- JSONB-related query decorators:
  - For example, those which rely on `jsonb` operators like `?`.

On MySQL / SQLite / other DBs:

- These decorators may not work at all or degrade to a simpler behavior.
- It’s a good idea for your project docs to clearly state:
  - **These features are PG-only**.

---

## 12. Controllers, CrudService, and custom logic

### 12.1 Recommended pattern: Factory + CrudService

Typical usage:

1. Factory in its own file:

```ts
// post.factory.ts
export const PostFactory = new RestfulFactory(Post, {
  relations: ['user', 'comments'],
  skipNonQueryableFields: true,
});
```

2. Service derived from Factory:

```ts
// post.service.ts
export class PostService extends PostFactory.crudService() {}
```

3. Controller using Factory decorators + CrudService:

```ts
// post.controller.ts
class FindAllPostDto extends PostFactory.findAllDto {}

@Controller('posts')
export class PostController {
  constructor(private readonly service: PostService) {}

  @PostFactory.findAll({ summary: 'List posts of current user' })
  async findAll(
    @PostFactory.findAllParam() dto: FindAllPostDto,
    @PutUser() user: User,        // business logic decorator, not from NICOT
  ) {
    return this.service.findAll(dto, qb =>
      qb.andWhere('post.userId = :uid', { uid: user.id }),
    );
  }
}
```

This ensures:

- DTOs are generated automatically (Query and Result);
- Hooks, access control decorators, and relation pruning all apply;
- Swagger and actual runtime behavior stay in sync.

### 12.2 Direct TypeORM usage notes

You can still inject and use a raw TypeORM `Repository<T>` for:

- Complex reports / analytics;
- Highly specialized queries / performance tuning.

But keep in mind:

- These calls will **not** run NICOT’s entity hooks automatically;
- They will **not** automatically honor `NotInResult` or other pruning rules;
- They will not use Factory’s relations whitelist or cursor pagination logic.

If you want these ad-hoc queries to be NICOT-aligned, you can:

- Post-process them with the same cleaning logic as CrudService (e.g. strip sensitive fields);
- Or explicitly separate them as internal endpoints, and keep NICOT’s CRUD as the public/supported API surface.

---

That’s the high-level NICOT API & behavior guide.  
For conceptual overview and examples, see `README.md`.
