import { ImportEntryDto } from './dto';
import {
  DeepPartial,
  DeleteResult,
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
  BlankReturnMessageDto,
  ClassType,
  PageSettingsWise,
  PaginatedReturnMessageDto,
  ReturnMessageDto,
} from 'nesties';
import { getNotInResultFields, reflector } from './utility/metadata';
import { getTypeormRelations } from './utility/get-typeorm-relations';
import {
  CursorPaginationDto,
  CursorPaginationReturnMessageDto,
} from './dto/cursor-pagination';
import { getPaginatedResult } from './utility/cursor-pagination-utils';

export type EntityId<T extends { id: any }> = T['id'];
export interface RelationDef {
  name: string;
  inner?: boolean;
  extraCondition?: string;
  extraConditionFields?: Record<string, any>;
  noSelect?: boolean;
}

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
}

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
  readonly entityRelations: (string | RelationDef)[];
  readonly extraGetQuery: (qb: SelectQueryBuilder<T>) => void;
  readonly log = new ConsoleLogger(`${this.entityClass.name}Service`);
  readonly _typeormRelations = getTypeormRelations(this.entityClass);

  constructor(
    public entityClass: ClassType<T>,
    public repo: Repository<T>,
    public crudOptions: CrudOptions<T>,
  ) {
    this.entityRelations = crudOptions.relations || [];
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.extraGetQuery = crudOptions.extraGetQuery || ((qb) => {});
  }

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
      for (const field of fields) {
        delete o[field];
      }
      visited.add(o);
      for (const relation of this._typeormRelations) {
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

  async _batchCreate(
    ents: T[],
    beforeCreate?: (repo: Repository<T>) => Promise<void>,
    skipErrors = false,
  ) {
    const entsWithId = ents.filter((ent) => ent.id != null);
    const result = await this.repo.manager.transaction(async (mdb) => {
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
    return result;
  }

  async create(_ent: T, beforeCreate?: (repo: Repository<T>) => Promise<void>) {
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
    ent.applyQuery?.(qb, this.entityAliasName);
  }

  queryBuilder() {
    return this.repo.createQueryBuilder(this.entityAliasName);
  }

  async findOne(
    id: EntityId<T>,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    extraQuery: (qb: SelectQueryBuilder<T>) => void = () => {},
  ) {
    const query = this.queryBuilder()
      .where(`${this.entityAliasName}.id = :id`, { id })
      .take(1);
    this._applyQueryRelations(query);
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
    const query = this.queryBuilder().where('1 = 1');
    const newEnt = new this.entityClass();
    if (ent) {
      Object.assign(newEnt, ent);
      await newEnt?.beforeGet?.();
      newEnt.applyQuery(query, this.entityAliasName);
    }
    this._applyQueryRelations(query);
    this._applyQueryFilters(query, newEnt);
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
    let result: UpdateResult | DeleteResult;
    const searchCond = {
      id,
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
    const ents = _ents.map((ent) => {
      const newEnt = new this.entityClass();
      Object.assign(
        newEnt,
        omit(ents, ...this._typeormRelations.map((r) => r.propertyName)),
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

  async exists(id: EntityId<T>): Promise<boolean> {
    const ent = await this.repo.findOne({ where: { id }, select: ['id'] });
    return !!ent;
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
