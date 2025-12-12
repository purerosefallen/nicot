import {
  CursorPaginationDto,
  CursorPaginationReturnMessageDto,
  ImportEntryDto,
} from './dto';
import {
  DeepPartial,
  DeleteResult,
  FindOneOptions,
  FindOptionsWhere,
  In,
  Repository,
  SelectQueryBuilder,
  UpdateResult,
} from 'typeorm';
import {
  EntityHooks,
  PageSettingsDto,
  PageSettingsFactory,
  QueryWise,
} from './bases';
import { ConsoleLogger } from '@nestjs/common';
import { camelCase } from 'typeorm/util/StringUtils';
import _, { omit } from 'lodash';
import {
  Awaitable,
  BlankReturnMessageDto,
  ClassType,
  GenericReturnMessageDto,
  PaginatedReturnMessageDto,
  ReturnMessageDto,
} from 'nesties';
import {
  getNotInResultFields,
  getSpecificFields,
  reflector,
} from './utility/metadata';
import { getTypeormRelations } from './utility/get-typeorm-relations';
import { getPaginatedResult } from './utility/cursor-pagination-utils';
import PQueue from 'p-queue';
import { RelationDef } from './utility/relation-def';
import { filterRelations } from './utility/filter-relations';
import { BindingValueMetadata, DefaultBindingKey } from './decorators';
import { observeDiff } from 'nfkit';

export type EntityId<T extends { id: any }> = T['id'];
type BindingSnapshot = Record<string, any>;

export const Relation = (
  name: string,
  options: Omit<RelationDef, 'name'> = {},
): RelationDef => {
  return { name, inner: false, ...options };
};

export const Inner = (
  name: string,
  options: Omit<RelationDef, 'name'> = {},
): RelationDef => {
  return Relation(name, { inner: true, ...options });
};

export type ValidCrudEntity<T> = Record<string, any> & {
  id: any;
} & Partial<QueryWise<T> & EntityHooks & PageSettingsFactory>;

export interface CrudOptions<T extends ValidCrudEntity<T>> {
  relations?: (string | RelationDef)[];
  extraGetQuery?: (qb: SelectQueryBuilder<T>) => void;
  hardDelete?: boolean;
  createOrUpdate?: boolean;
  keepEntityVersioningDates?: boolean;
  outputFieldsToOmit?: (keyof T)[];
}

const loadedParsers = new Set<string>();
const loadFullTextQueue = new PQueue({
  concurrency: 1,
});

export class CrudBase<T extends ValidCrudEntity<T>> {
  readonly entityName = this.entityClass.name;
  readonly entityReturnMessageDto = ReturnMessageDto(this.entityClass);
  readonly importEntryDto = ImportEntryDto(this.entityClass);
  readonly importReturnMessageDto = ReturnMessageDto([this.importEntryDto]);
  readonly entityPaginatedReturnMessageDto = PaginatedReturnMessageDto(
    this.entityClass,
  );
  readonly entityCursorPaginatedReturnMessageDto =
    CursorPaginationReturnMessageDto(this.entityClass);
  readonly entityRelations = filterRelations(
    this.entityClass,
    this.crudOptions.relations,
    (r) => !r.computed,
  );
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  readonly extraGetQuery = this.crudOptions.extraGetQuery || ((qb) => {});
  readonly log = new ConsoleLogger(`${this.entityClass.name}Service`);
  readonly _typeormRelations = getTypeormRelations(this.entityClass);

  constructor(
    public entityClass: ClassType<T>,
    public repo: Repository<T>,
    public crudOptions: CrudOptions<T>,
  ) {}

  // cleaning entities

  _cleanEntityNotInResultFields(ent: T): T {
    const visited = new Set();
    const runSingleObject = (o: any, cl) => {
      if (visited.has(o)) {
        return o;
      }
      const fields = getNotInResultFields(
        cl,
        this.crudOptions.keepEntityVersioningDates,
      );
      if (cl === this.entityClass && this.crudOptions.outputFieldsToOmit) {
        fields.push(...(this.crudOptions.outputFieldsToOmit as string[]));
      }
      for (const field of fields) {
        delete o[field];
      }
      visited.add(o);
      for (const relation of getTypeormRelations(cl)) {
        const propertyName = relation.propertyName as string;
        if (o[propertyName]) {
          if (Array.isArray(o[propertyName])) {
            o[propertyName] = o[propertyName].map((r) =>
              runSingleObject(r, relation.propertyClass),
            );
          } else {
            o[propertyName] = runSingleObject(
              o[propertyName],
              relation.propertyClass,
            );
          }
        }
      }
      return o;
    };

    return runSingleObject(ent, this.entityClass);
  }

  cleanEntityNotInResultFields<E extends T | T[]>(ents: E): E {
    if (Array.isArray(ents)) {
      return ents.map((ent) => this._cleanEntityNotInResultFields(ent)) as E;
    } else {
      return this._cleanEntityNotInResultFields(ents as T) as E;
    }
  }

  // binding things

  readonly _tmpBindingMap = new Map<string, any>();
  readonly _bindingCache = new Map<
    string,
    BindingValueMetadata & { field: string }
  >();

  _lookForBindingValueField(bindingKey: string) {
    if (this._bindingCache.has(bindingKey)) {
      return this._bindingCache.get(bindingKey);
    }
    const bindingServiceFields = getSpecificFields(this, 'bindingValue');
    const useField = bindingServiceFields.find((f) => {
      const meta = reflector.get('bindingValue', this, f);
      return meta?.bindingKey === bindingKey;
    });
    if (useField) {
      const meta = reflector.get('bindingValue', this, useField);
      const res = {
        ...meta,
        field: useField,
      };
      this._bindingCache.set(bindingKey, res);
      return res;
    }
    return undefined;
  }

  _resolveBindingValue<K extends keyof T>(
    entityField: K,
  ): T[K] | Promise<T[K]> {
    const bindingKey = reflector.get(
      'bindingColumn',
      this.entityClass,
      entityField as string,
    );
    if (!bindingKey) {
      return undefined;
    }
    if (this._tmpBindingMap.has(bindingKey)) {
      return this._tmpBindingMap.get(bindingKey);
    }
    const bindingValueField = this._lookForBindingValueField(bindingKey);
    if (!bindingValueField) {
      return undefined;
    }
    if (bindingValueField.isMethod) {
      return (this as any)[bindingValueField.field]();
    } else {
      return (this as any)[bindingValueField.field];
    }
  }

  // MUST be called 1st on every CRUD operation
  async getBindingPartialEntity(): Promise<Partial<T>> {
    const bindingFields = getSpecificFields(this.entityClass, 'bindingColumn');
    if (!bindingFields.length) {
      return {};
    }
    const values = bindingFields.map((field, i) => {
      return {
        field,
        value: this._resolveBindingValue(field),
        i,
      };
    });
    this._tmpBindingMap.clear();
    const containingPromiseValues = values.filter(
      (v) => v.value instanceof Promise,
    );
    if (containingPromiseValues.length) {
      await Promise.all(
        containingPromiseValues.map(async (v) => {
          v.value = await v.value;
        }),
      );
    }
    // now it's all resolved
    const res: Partial<T> = {};
    for (const v of values) {
      if (v.value != null) {
        (res as any)[v.field] = v.value;
      }
    }
    return res;
  }

  useBinding(value: any, bindngKey = DefaultBindingKey): this {
    this._tmpBindingMap.set(bindngKey, value);
    return this;
  }

  _freezeBindings(): BindingSnapshot {
    const res: Record<string, any> = {};
    for (const [key, value] of this._tmpBindingMap.entries()) {
      res[key] = value;
    }
    this._tmpBindingMap.clear();
    return res;
  }

  _restoreBindings(frozen: BindingSnapshot): this {
    this._tmpBindingMap.clear();
    for (const key of Object.keys(frozen)) {
      this._tmpBindingMap.set(key, frozen[key]);
    }
    return this;
  }

  async beforeSuper<R>(fn: () => Promise<R>): Promise<R> {
    const snap = this._freezeBindings();
    const res = await fn();
    this._restoreBindings(snap);
    return res;
  }

  async _batchCreate(
    ents: T[],
    beforeCreate?: (repo: Repository<T>) => Promise<void>,
    skipErrors = false,
  ) {
    const entsWithId = ents.filter((ent) => ent.id != null);
    return this.repo.manager.transaction(async (mdb) => {
      let skipped: { result: string; entry: T }[] = [];
      const repo = mdb.getRepository(this.entityClass);

      let entsToSave = ents;

      if (entsWithId.length) {
        const entIds = entsWithId.map((ent) => ent.id);
        const entIdChunks = _.chunk(entIds, 65535);
        const existingEnts = (
          await Promise.all(
            entIdChunks.map((chunk) =>
              repo.find({
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                where: {
                  id: In<string | number>(chunk),
                },
                select: this.crudOptions.createOrUpdate
                  ? undefined
                  : ['id', 'deleteTime'],
                withDeleted: true,
              }),
            ),
          )
        ).flat();
        if (existingEnts.length) {
          const existingEntsWithoutDeleteTime = existingEnts.filter(
            (ent) => ent.deleteTime == null,
          );
          const existingEntsWithDeleteTime = existingEnts.filter(
            (ent) => ent.deleteTime != null,
          );
          if (existingEntsWithoutDeleteTime.length) {
            if (this.crudOptions.createOrUpdate) {
              const existingIdMap = new Map<number, T>();
              existingEntsWithoutDeleteTime.forEach((ent) => {
                existingIdMap.set(ent.id, ent);
              });
              entsToSave = [];
              for (const ent of ents) {
                if (existingIdMap.has(ent.id)) {
                  const existingEnt = existingIdMap.get(ent.id);
                  Object.assign(existingEnt, ent);
                  entsToSave.push(existingEnt);
                } else {
                  entsToSave.push(ent);
                }
              }
            } else {
              if (!skipErrors) {
                throw new BlankReturnMessageDto(
                  404,
                  `${this.entityName} ID ${existingEntsWithoutDeleteTime.join(
                    ',',
                  )} already exists`,
                ).toException();
              }
              const existingEntsWithoutDeleteTimeIdSet = new Set(
                existingEntsWithoutDeleteTime.map((e) => e.id),
              );
              const skippedEnts = ents.filter((ent) =>
                existingEntsWithoutDeleteTimeIdSet.has(ent.id),
              );
              skipped = skippedEnts.map((ent) => ({
                result: 'Already exists',
                entry: ent,
              }));
              const skippedEntsSet = new Set(skippedEnts);
              entsToSave = ents.filter((ent) => !skippedEntsSet.has(ent));
            }
          }
          if (existingEntsWithDeleteTime.length) {
            await repo.delete(
              existingEntsWithDeleteTime.map((ent) => ent.id) as any[],
            );
          }
        }
      }
      if (beforeCreate) {
        await beforeCreate(repo);
      }
      try {
        const entChunksToSave = _.chunk(
          entsToSave,
          Math.floor(
            65535 / Math.max(1, Object.keys(entsToSave[0] || {}).length),
          ),
        );
        let results: T[] = [];
        for (const entChunk of entChunksToSave) {
          const savedChunk = await repo.save(entChunk);
          results = results.concat(savedChunk);
        }
        return {
          results,
          skipped,
        };
      } catch (e) {
        this.log.error(
          `Failed to create entity ${JSON.stringify(
            entsToSave,
          )}: ${e.toString()}`,
        );
        throw new BlankReturnMessageDto(500, 'Internal error').toException();
      }
    });
  }

  async create(_ent: T, beforeCreate?: (repo: Repository<T>) => Promise<void>) {
    const bindingEnt = await this.getBindingPartialEntity();
    if (!_ent) {
      throw new BlankReturnMessageDto(400, 'Invalid entity').toException();
    }
    let ent = new this.entityClass();
    Object.assign(
      ent,
      omit(_ent, ...this._typeormRelations.map((r) => r.propertyName)),
    );
    const invalidReason = ent.isValidInCreate();
    if (invalidReason) {
      throw new BlankReturnMessageDto(400, invalidReason).toException();
    }
    const savedEnt = await this.repo.manager.transaction(async (mdb) => {
      const repo = mdb.getRepository(this.entityClass);
      if (ent.id != null) {
        const existingEnt = await repo.findOne({
          where: { id: ent.id },
          select: this.crudOptions.createOrUpdate
            ? undefined
            : ['id', 'deleteTime'],
          withDeleted: true,
        });
        if (existingEnt) {
          if (existingEnt.deleteTime) {
            await repo.delete(existingEnt.id);
          } else if (this.crudOptions.createOrUpdate) {
            Object.assign(existingEnt, ent);
            ent = existingEnt;
          } else {
            throw new BlankReturnMessageDto(
              404,
              `${this.entityName} ID ${ent.id} already exists`,
            ).toException();
          }
        }
      }
      Object.assign(ent, bindingEnt);
      if (beforeCreate) {
        await beforeCreate(repo);
      }
      await ent.beforeCreate?.();
      try {
        const savedEnt = await repo.save(ent as DeepPartial<T>);
        await savedEnt.afterCreate?.();
        return this.cleanEntityNotInResultFields(savedEnt);
      } catch (e) {
        this.log.error(
          `Failed to create entity ${JSON.stringify(ent)}: ${e.toString()}`,
        );
        throw new BlankReturnMessageDto(500, 'Internal error').toException();
      }
    });
    return new this.entityReturnMessageDto(200, 'success', savedEnt);
  }

  get entityAliasName() {
    return camelCase(this.entityName);
  }

  _applyQueryRelation(qb: SelectQueryBuilder<T>, relation: RelationDef) {
    const { name } = relation;
    const relationUnit = name.split('.');
    const base =
      relationUnit.length === 1
        ? this.entityAliasName
        : relationUnit.slice(0, relationUnit.length - 1).join('_');
    const property = relationUnit[relationUnit.length - 1];
    const properyAlias = relationUnit.join('_');
    const methodName = relation.inner ? 'innerJoin' : 'leftJoin';
    if (!relation.noSelect) {
      qb.addSelect(properyAlias);
    }
    qb[methodName](
      `${base}.${property}`,
      properyAlias,
      relation.extraCondition || undefined,
      relation.extraConditionFields || undefined,
    );
  }

  _applyQueryRelations(qb: SelectQueryBuilder<T>) {
    for (const relation of this.entityRelations) {
      if (typeof relation === 'string') {
        this._applyQueryRelation(qb, { name: relation });
      } else {
        this._applyQueryRelation(qb, relation);
      }
    }
  }

  _applyQueryFilters(qb: SelectQueryBuilder<T>, ent: T) {
    const queryFields = reflector.getArray(
      'queryConditionFields',
      this.entityClass,
    );
    for (const field of queryFields) {
      const condition = reflector.get(
        'queryCondition',
        this.entityClass,
        field,
      );
      if (condition) {
        condition(ent, qb, this.entityAliasName, field);
      }
    }
  }

  queryBuilder() {
    return this.repo.createQueryBuilder(this.entityAliasName);
  }

  _applyQueryFromBinding(bindingEnt: Partial<T>, qb: SelectQueryBuilder<T>) {
    for (const [key, value] of Object.entries(bindingEnt)) {
      const typeormKey = `_binding_${key}`;
      qb.andWhere(`${this.entityAliasName}.${key} = :${typeormKey}`, {
        [typeormKey]: value,
      });
    }
  }

  async findOne(
    id: EntityId<T>,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    extraQuery: (qb: SelectQueryBuilder<T>) => void = () => {},
  ) {
    const bindingEnt = await this.getBindingPartialEntity();
    const query = this.queryBuilder()
      .where(`${this.entityAliasName}.id = :id`, { id })
      .take(1);
    this._applyQueryRelations(query);
    this._applyQueryFromBinding(bindingEnt, query);
    this.extraGetQuery(query);
    extraQuery(query);
    query.take(1);
    let ent: T;
    try {
      ent = await query.getOne();
    } catch (e) {
      const [sql, params] = query.getQueryAndParameters();
      this.log.error(
        `Failed to read entity ID ${id} with SQL ${sql} param ${params.join(
          ',',
        )}: ${e.toString()}`,
      );
      throw new BlankReturnMessageDto(500, 'Internal error').toException();
    }
    if (!ent) {
      throw new BlankReturnMessageDto(
        404,
        `${this.entityName} ID ${id} not found.`,
      ).toException();
    }
    await ent.afterGet?.();
    return new this.entityReturnMessageDto(
      200,
      'success',
      this.cleanEntityNotInResultFields(ent),
    );
  }

  async _preFindAll(
    ent?: Partial<T>,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    extraQuery: (qb: SelectQueryBuilder<T>) => void = () => {},
  ) {
    const bindingEnt = await this.getBindingPartialEntity();
    const query = this.queryBuilder().where('1 = 1');
    const newEnt = new this.entityClass();
    if (ent) {
      Object.assign(newEnt, ent);
      await newEnt?.beforeGet?.();
      newEnt.applyQuery(query, this.entityAliasName);
    }
    this._applyQueryRelations(query);
    this._applyQueryFilters(query, newEnt);
    this._applyQueryFromBinding(bindingEnt, query);
    const pageSettings =
      newEnt instanceof PageSettingsDto
        ? newEnt
        : Object.assign(new PageSettingsDto(), newEnt);
    this.extraGetQuery(query);
    extraQuery(query);
    return { query, newEnt, pageSettings };
  }

  async findAll(
    ent?: Partial<T>,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    extraQuery: (qb: SelectQueryBuilder<T>) => void = () => {},
  ) {
    const { query, pageSettings } = await this._preFindAll(ent, extraQuery);
    pageSettings.applyPaginationQuery(query);
    try {
      const [data, count] = await query.getManyAndCount();
      await Promise.all(data.map((ent) => ent.afterGet?.()));
      return new this.entityPaginatedReturnMessageDto(
        200,
        'success',
        this.cleanEntityNotInResultFields(data),
        count,
        pageSettings.getActualPageSettings(),
      );
    } catch (e) {
      const [sql, params] = query.getQueryAndParameters();
      this.log.error(
        `Failed to read entity cond ${JSON.stringify(
          ent,
        )} with SQL ${sql} param ${params.join(',')}: ${e.toString()}`,
      );
      throw new BlankReturnMessageDto(500, 'Internal error').toException();
    }
  }
  async findAllCursorPaginated(
    ent?: Partial<T & Partial<CursorPaginationDto>>,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    extraQuery: (qb: SelectQueryBuilder<T>) => void = () => {},
  ) {
    const { query, pageSettings } = await this._preFindAll(ent, extraQuery);
    try {
      const { data, paginatedResult } = await getPaginatedResult(
        query,
        this.entityClass,
        this.entityAliasName,
        pageSettings.getRecordsPerPage(),
        ent.paginationCursor,
      );
      await Promise.all(data.map((ent) => ent.afterGet?.()));
      return new this.entityCursorPaginatedReturnMessageDto(
        200,
        'success',
        this.cleanEntityNotInResultFields(data),
        paginatedResult,
      );
    } catch (e) {
      const [sql, params] = query.getQueryAndParameters();
      this.log.error(
        `Failed to read entity cond ${JSON.stringify(
          ent,
        )} with SQL ${sql} param ${params.join(',')}: ${e.toString()}`,
      );
      throw new BlankReturnMessageDto(500, 'Internal error').toException();
    }
  }

  async update(
    id: EntityId<T>,
    entPart: Partial<T>,
    cond: FindOptionsWhere<T> = {},
  ) {
    const bindingEnt = await this.getBindingPartialEntity();
    let result: UpdateResult;
    const ent = new this.entityClass();
    Object.assign(ent, entPart);
    const invalidReason = ent.isValidInUpdate();
    if (invalidReason) {
      throw new BlankReturnMessageDto(400, invalidReason).toException();
    }
    await ent.beforeUpdate?.();
    try {
      result = await this.repo.update(
        {
          id,
          ...bindingEnt,
          ...cond,
        },
        ent,
      );
    } catch (e) {
      this.log.error(
        `Failed to update entity ID ${id} to ${JSON.stringify(
          entPart,
        )}: ${e.toString()}`,
      );
      throw new BlankReturnMessageDto(500, 'Internal error').toException();
    }
    if (!result.affected) {
      throw new BlankReturnMessageDto(
        404,
        `${this.entityName} ID ${id} not found.`,
      ).toException();
    }
    return new BlankReturnMessageDto(200, 'success');
  }

  async delete(id: EntityId<T>, cond: FindOptionsWhere<T> = {}) {
    const bindingEnt = await this.getBindingPartialEntity();
    let result: UpdateResult | DeleteResult;
    const searchCond = {
      id,
      ...bindingEnt,
      ...cond,
    };
    try {
      result = await (this.crudOptions.hardDelete ||
      !this.repo.manager.connection.getMetadata(this.entityClass)
        .deleteDateColumn
        ? this.repo.delete(searchCond)
        : this.repo.softDelete(searchCond));
    } catch (e) {
      this.log.error(`Failed to delete entity ID ${id}: ${e.toString()}`);
      throw new BlankReturnMessageDto(500, 'Internal error').toException();
    }
    if (!result.affected) {
      throw new BlankReturnMessageDto(
        404,
        `${this.entityName} ID ${id} not found.`,
      ).toException();
    }
    return new BlankReturnMessageDto(200, 'success');
  }

  async importEntities(
    _ents: T[],
    extraChecking?: (ent: T) => string | Promise<string>,
  ) {
    const bindingEnt = await this.getBindingPartialEntity();
    const ents = _ents.map((ent) => {
      const newEnt = new this.entityClass();
      Object.assign(
        newEnt,
        omit(ent, ...this._typeormRelations.map((r) => r.propertyName)),
      );
      return newEnt;
    });
    const invalidResults = _.compact(
      await Promise.all(
        ents.map(async (ent) => {
          const reason = ent.isValidInCreate();
          if (reason) {
            return { entry: ent, result: reason };
          }
          if (extraChecking) {
            const reason = await extraChecking(ent);
            if (reason) {
              return { entry: ent, result: reason };
            }
          }
        }),
      ),
    );
    const remainingEnts = ents.filter(
      (ent) => !invalidResults.find((result) => result.entry === ent),
    );
    for (const ent of remainingEnts) {
      Object.assign(ent, bindingEnt);
    }
    await Promise.all(remainingEnts.map((ent) => ent.beforeCreate?.()));
    const data = await this._batchCreate(remainingEnts, undefined, true);
    await Promise.all(data.results.map((e) => e.afterCreate?.()));
    const results = [
      ...invalidResults,
      ...data.skipped,
      ...data.results.map((e) => ({ entry: e, result: 'OK' })),
    ];
    return new this.importReturnMessageDto(
      200,
      'success',
      results.map((r) => {
        const entry = new this.importEntryDto();
        Object.assign(entry, r);
        entry.entry = this.cleanEntityNotInResultFields(r.entry);
        return entry;
      }),
    );
  }

  async exists(
    id: EntityId<T>,
    cond: FindOptionsWhere<T> = {},
  ): Promise<boolean> {
    const bindingEnt = await this.getBindingPartialEntity();
    return this.repo.exists({
      where: { id, ...bindingEnt, ...cond },
    });
  }

  async operation<R>(
    id: EntityId<T>,
    cb: (
      ent: T,
      ctx: {
        repo: Repository<T>;
        flush: () => Promise<void>;
      },
    ) => Awaitable<R>,
    options: {
      find?: FindOneOptions<T>;
      repo?: Repository<T>;
    } = {},
  ): Promise<GenericReturnMessageDto<R>> {
    const bindingEnt = await this.getBindingPartialEntity();

    const where: FindOptionsWhere<T> = {
      id,
      ...bindingEnt,
      ...(options.find?.where || {}),
    };

    const throw404 = () => {
      throw new BlankReturnMessageDto(
        404,
        `${this.entityName} ID ${id} not found.`,
      ).toException();
    };

    if (!(await this.repo.exists({ where }))) {
      throw404();
    }

    // -------- utils (keep simple) --------

    const isPlainObject = (v: unknown): v is Record<string, any> => {
      if (!v || typeof v !== 'object') return false;
      const proto = Object.getPrototypeOf(v);
      return proto === Object.prototype || proto === null;
    };

    const cloneAtomicOrJson = <V>(v: V): V => {
      if (v == null) return v;

      // primitives
      if (typeof v !== 'object') return v;

      // Date
      if (v instanceof Date) return new Date(v.getTime()) as any;

      // Buffer / TypedArray / ArrayBuffer
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) {
        return Buffer.from(v) as any;
      }
      if (ArrayBuffer.isView(v)) {
        // Uint8Array etc.
        const ctor = (v as any).constructor;
        return new ctor((v as any).slice?.() ?? v) as any;
      }
      if (v instanceof ArrayBuffer) return v.slice(0) as any;

      // array / plain object => deep clone for json/jsonb usage
      if (Array.isArray(v) || isPlainObject(v)) {
        // Node 18+ has structuredClone. Jest env usually supports it.
        // Fallback to JSON clone (good enough for jsonb; won't support Date/Buffer but we handled those above)
        const sc = (globalThis as any).structuredClone;
        if (typeof sc === 'function') return sc(v);
        return JSON.parse(JSON.stringify(v)) as V;
      }

      // other objects (class instances) => keep reference (rare for real columns)
      return v;
    };

    const deepEqual = (a: any, b: any): boolean => {
      if (a === b) return true;
      if (a == null || b == null) return a === b;

      // Date
      if (a instanceof Date && b instanceof Date)
        return a.getTime() === b.getTime();

      // Buffer
      if (
        typeof Buffer !== 'undefined' &&
        Buffer.isBuffer(a) &&
        Buffer.isBuffer(b)
      ) {
        return a.equals(b);
      }

      // TypedArray / ArrayBuffer
      if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
        if (a.byteLength !== b.byteLength) return false;
        const ua = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        const ub = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
        for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
        return true;
      }
      if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
        if (a.byteLength !== b.byteLength) return false;
        const ua = new Uint8Array(a);
        const ub = new Uint8Array(b);
        for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
        return true;
      }

      // arrays
      if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++)
          if (!deepEqual(a[i], b[i])) return false;
        return true;
      }

      // plain objects
      if (typeof a === 'object' && typeof b === 'object') {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) {
          if (!deepEqual(a[k], b[k])) return false;
        }
        return true;
      }

      return false;
    };

    // -------- core --------

    const op = async (repo: Repository<T>) => {
      const ent = await repo.findOne({
        lock: { mode: 'pessimistic_write', tables: [repo.metadata.tableName] },
        ...(options.find || {}),
        where,
      });

      if (!ent) throw404();

      // columns we are allowed to update
      const columns = repo.metadata.columns.map(
        (c) => c.propertyName,
      ) as (keyof T)[];

      // snapshot ONLY stores column values, and clones json-ish values to avoid shared refs
      const snapshot: Partial<Record<keyof T, any>> = {};
      const snapshotHasKey: Partial<Record<keyof T, boolean>> = {};
      for (const key of columns) {
        snapshotHasKey[key] = Object.prototype.hasOwnProperty.call(
          ent as any,
          key,
        );
        snapshot[key] = cloneAtomicOrJson((ent as any)[key]);
      }

      const flush = async () => {
        const patch: Partial<T> = {};

        for (const key of columns) {
          const hasNow = Object.prototype.hasOwnProperty.call(ent, key);

          // delete -> NULL (only if it existed initially or previously flushed)
          if (!hasNow) {
            if (snapshotHasKey[key]) {
              patch[key] = null;
              snapshotHasKey[key] = true; // after update, column exists with null
              snapshot[key] = null;
            }
            continue;
          }

          const current = ent[key];
          const before = snapshot[key];

          if (!deepEqual(before, current)) {
            patch[key] = current;
            snapshotHasKey[key] = true;
            snapshot[key] = cloneAtomicOrJson(current);
          }
        }

        if (Object.keys(patch).length) {
          await repo.update({ id } as any, patch);
        }
      };

      const result = await cb(ent, { repo, flush });
      await flush();
      return result;
    };

    const res = await (options.repo
      ? op(options.repo)
      : this.repo.manager.transaction((tdb) =>
          op(tdb.getRepository(this.entityClass)),
        ));

    return res == null
      ? new BlankReturnMessageDto(200, 'success')
      : new GenericReturnMessageDto(200, 'success', res);
  }

  async _loadFullTextIndex() {
    const fields = reflector.getArray(
      'queryFullTextColumnFields',
      this.entityClass,
    );

    const metadata = this.repo.metadata;
    const tableName = metadata.tableName; // 真正数据库里的表名

    const sqls: string[] = [];

    for (const field of fields) {
      const options = reflector.get(
        'queryFullTextColumn',
        this.entityClass,
        field,
      );
      if (!options) continue;

      const configurationName = options.configuration;
      const parser = options.parser;

      if (parser && !loadedParsers.has(parser)) {
        loadedParsers.add(parser);

        sqls.push(
          `CREATE EXTENSION IF NOT EXISTS ${parser};`,
          `DROP TEXT SEARCH CONFIGURATION IF EXISTS ${configurationName};`,
          `CREATE TEXT SEARCH CONFIGURATION ${configurationName} (PARSER = ${parser});`,
          `ALTER TEXT SEARCH CONFIGURATION ${configurationName} ADD MAPPING FOR n, v, a, i, e, l WITH simple;`,
        );
      }

      const indexName = `idx_fulltext_${this.entityName}_${field}`;

      // 建立索引，索引名字用 this.entityName，表名用真实 tableName
      sqls.push(
        `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" USING GIN (to_tsvector('${configurationName}', "${field}"));`,
      );
    }
    if (sqls.length) {
      await this.repo.manager.query(sqls.join('\n'));
    }
  }

  async onModuleInit() {
    await loadFullTextQueue.add(() => this._loadFullTextIndex());
  }
}

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
