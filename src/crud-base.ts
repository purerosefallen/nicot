import {
  BlankReturnMessageDto,
  ImportEntryDto,
  PaginatedReturnMessageDto,
  ReturnMessageDto,
} from './dto';
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
  DeletionWise,
  EntityHooks,
  PageSettingsFactory,
  QueryWise,
} from './bases';
import { ConsoleLogger } from '@nestjs/common';
import { camelCase } from 'typeorm/util/StringUtils';
import _ from 'lodash';
import { ClassType } from './utility/insert-field';

export type EntityId<T extends { id: any }> = T['id'];
export interface RelationDef {
  name: string;
  inner?: boolean;
}

export const Inner = (name: string): RelationDef => {
  return { name, inner: true };
};

export type ValidCrudEntity<T> = Record<string, any> & {
  id: any;
} & QueryWise<T> &
  DeletionWise &
  EntityHooks &
  PageSettingsFactory;

export interface CrudOptions<T extends ValidCrudEntity<T>> {
  relations?: (string | RelationDef)[];
  extraGetQuery?: (qb: SelectQueryBuilder<T>) => void;
  hardDelete?: boolean;
}

export class CrudBase<T extends ValidCrudEntity<T>> {
  readonly entityName = this.entityClass.name;
  readonly entityReturnMessageDto = ReturnMessageDto(this.entityClass);
  readonly importEntryDto = ImportEntryDto(this.entityClass);
  readonly importReturnMessageDto = ReturnMessageDto([this.importEntryDto]);
  readonly entityPaginatedReturnMessageDto = PaginatedReturnMessageDto(
    this.entityClass,
  );
  readonly entityRelations: (string | RelationDef)[];
  readonly extraGetQuery: (qb: SelectQueryBuilder<T>) => void;
  readonly log = new ConsoleLogger(`${this.entityClass.name}Service`);

  constructor(
    public entityClass: ClassType<T>,
    public repo: Repository<T>,
    public crudOptions: CrudOptions<T>,
  ) {
    this.entityRelations = crudOptions.relations || [];
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.extraGetQuery = crudOptions.extraGetQuery || ((qb) => {});
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
        const existingEnts = await repo.find({
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          where: { id: In<string | number>(entsWithId.map((ent) => ent.id)) },
          select: ['id', 'deleteTime'],
          withDeleted: true,
        });
        if (existingEnts.length) {
          const existingEntsWithoutDeleteTime = existingEnts.filter(
            (ent) => ent.deleteTime == null,
          );
          const existingEntsWithDeleteTime = existingEnts.filter(
            (ent) => ent.deleteTime != null,
          );
          if (existingEntsWithoutDeleteTime.length) {
            if (!skipErrors) {
              throw new BlankReturnMessageDto(
                404,
                `${this.entityName} ID ${existingEntsWithoutDeleteTime.join(
                  ',',
                )} already exists`,
              ).toException();
            }
            const skippedEnts = ents.filter((ent) =>
              existingEntsWithoutDeleteTime.some((e) => e.id === ent.id),
            );
            skipped = skippedEnts.map((ent) => ({
              result: 'Already exists',
              entry: ent,
            }));
            const skippedEntsSet = new Set(skippedEnts);
            entsToSave = ents.filter((ent) => !skippedEntsSet.has(ent));
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
        const results = await repo.save(entsToSave as DeepPartial<T>[]);
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

  async create(ent: T, beforeCreate?: (repo: Repository<T>) => Promise<void>) {
    if (!ent) {
      throw new BlankReturnMessageDto(400, 'Invalid entity').toException();
    }
    const invalidReason = ent.isValidInCreate();
    if (invalidReason) {
      throw new BlankReturnMessageDto(400, invalidReason).toException();
    }
    const savedEnt = await this.repo.manager.transaction(async (mdb) => {
      const repo = mdb.getRepository(this.entityClass);
      if (ent.id != null) {
        const existingEnt = await repo.findOne({
          where: { id: ent.id },
          select: ['id', 'deleteTime'],
          withDeleted: true,
        });
        if (existingEnt) {
          if (existingEnt.deleteTime) {
            await repo.delete(existingEnt.id);
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
      await ent.beforeCreate();
      try {
        const savedEnt = await repo.save(ent as DeepPartial<T>);
        await savedEnt.afterCreate();
        return savedEnt;
      } catch (e) {
        this.log.error(
          `Failed to create entity ${JSON.stringify(ent)}: ${e.toString()}`,
        );
        throw new BlankReturnMessageDto(500, 'Internal error').toException();
      }
    });
    return new this.entityReturnMessageDto(201, 'success', savedEnt);
  }

  get entityAliasName() {
    return camelCase(this.entityName);
  }

  _applyRelationToQuery(qb: SelectQueryBuilder<T>, relation: RelationDef) {
    const { name } = relation;
    const relationUnit = name.split('.');
    const base =
      relationUnit.length === 1
        ? this.entityAliasName
        : relationUnit.slice(0, relationUnit.length - 1).join('_');
    const property = relationUnit[relationUnit.length - 1];
    const properyAlias = relationUnit.join('_');
    const methodName = relation.inner
      ? 'innerJoinAndSelect'
      : ('leftJoinAndSelect' as const);
    qb[methodName](`${base}.${property}`, properyAlias);
  }

  _applyRelationsToQuery(qb: SelectQueryBuilder<T>) {
    for (const relation of this.entityRelations) {
      if (typeof relation === 'string') {
        this._applyRelationToQuery(qb, { name: relation });
      } else {
        this._applyRelationToQuery(qb, relation);
      }
    }
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
    this._applyRelationsToQuery(query);
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
    await ent.afterGet();
    return new this.entityReturnMessageDto(200, 'success', ent);
  }

  async findAll(
    ent?: Partial<T>,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    extraQuery: (qb: SelectQueryBuilder<T>) => void = () => {},
  ) {
    const query = this.queryBuilder();
    const newEnt = new this.entityClass();
    if (ent) {
      Object.assign(newEnt, ent);
      await newEnt.beforeGet();
      newEnt.applyQuery(query, this.entityAliasName);
    }
    this._applyRelationsToQuery(query);
    this.extraGetQuery(query);
    extraQuery(query);
    try {
      const [ents, count] = await query.getManyAndCount();
      await Promise.all(ents.map((ent) => ent.afterGet()));
      return new this.entityPaginatedReturnMessageDto(
        200,
        'success',
        ents,
        count,
        newEnt.getActualPageSettings(),
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
    await ent.beforeUpdate();
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
      result = await (this.crudOptions.hardDelete
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
    return new BlankReturnMessageDto(204, 'success');
  }

  async importEntities(
    ents: T[],
    extraChecking?: (ent: T) => string | Promise<string>,
  ) {
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
    await Promise.all(remainingEnts.map((ent) => ent.beforeCreate()));
    const data = await this._batchCreate(remainingEnts, undefined, true);
    await Promise.all(data.results.map((e) => e.afterCreate()));
    const results = [
      ...invalidResults,
      ...data.skipped,
      ...data.results.map((e) => ({ entry: e, result: 'OK' })),
    ];
    return new this.importReturnMessageDto(
      201,
      'success',
      results.map((r) => {
        const entry = new this.importEntryDto();
        Object.assign(entry, r);
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
