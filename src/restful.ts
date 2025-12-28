import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ImportDataDto, ImportEntryDto } from './dto';
import {
  AnyClass,
  MergeMethodDecorators,
  PaginatedReturnMessageDto,
  ReturnMessageDto,
  ClassType,
  getApiProperty,
  DataPipe,
  ApiTypeResponse,
  ApiBlankResponse,
  ApiError,
} from 'nesties';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptions,
  IntersectionType,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { OperationObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import _, { upperFirst } from 'lodash';
import {
  getNotInResultFields,
  getSpecificFields,
  reflector,
} from './utility/metadata';
import { RenameClass } from 'nesties';
import { getTypeormRelations } from './utility/get-typeorm-relations';
import { CrudBase, CrudOptions, CrudService } from './crud-base';
import { PageSettingsDto } from './bases';
import { CursorPaginationDto, CursorPaginationReturnMessageDto } from './dto';
import {
  BaseRestfulController,
  RestfulMethods,
  RestfulPaginateType,
} from './bases/base-restful-controller';
import { Repository } from 'typeorm';
import { RelationDef } from './utility/relation-def';
import {
  filterRelations,
  extractRelationName,
} from './utility/filter-relations';
import { OmitTypeExclude, PickTypeExpose } from './utility/omit-type-exclude';
import { nonTransformableTypes } from './utility/non-transformable-types';
import { PatchColumnsInGet } from './utility/patch-column-in-get';
import { OmitPipe, OptionalDataPipe, PickPipe } from './decorators';
import { MutatorPipe } from './utility/mutate-pipe';
import { Memorize } from 'nfkit';

export interface RestfulFactoryOptions<
  T,
  O extends keyof T = never,
  W extends keyof T = never,
  C extends keyof T = never,
  U extends keyof T = never,
  US extends keyof T = never,
  F extends keyof T = never,
  R extends keyof T = never,
> {
  fieldsToOmit?: O[];
  writeFieldsToOmit?: W[];
  createFieldsToOmit?: C[];
  updateFieldsToOmit?: U[];
  upsertFieldsToOmit?: US[];
  findAllFieldsToOmit?: F[];
  outputFieldsToOmit?: R[];
  prefix?: string;
  keepEntityVersioningDates?: boolean;
  entityClassName?: string;
  relations?: (string | RelationDef)[];
  skipNonQueryableFields?: boolean;
  upsertIncludeRelations?: boolean;
}

const getCurrentLevelRelations = (relations: string[]) =>
  relations.filter((r) => !r.includes('.'));

const getNextLevelRelations = (relations: string[], enteringField: string) =>
  relations
    .filter((r) => r.includes('.') && r.startsWith(`${enteringField}.`))
    .map((r) => r.split('.').slice(1).join('.'));

export interface ResourceOptions extends Partial<OperationObject> {
  prefix?: string;
}

export class RestfulFactory<
  T extends { id: any },
  O extends keyof T = never,
  W extends keyof T = never,
  C extends keyof T = never,
  U extends keyof T = never,
  US extends keyof T = never,
  F extends keyof T = never,
  R extends keyof T = never,
> {
  constructor(
    public readonly entityClass: ClassType<T>,
    private options: RestfulFactoryOptions<T, O, W, C, U, US, F, R> = {},
    private __resolveVisited = new Map<AnyClass, [AnyClass]>(),
  ) {
    if (options.relations) {
      // we have to filter once to ensure every relation is correct
      filterRelations(entityClass, options.relations);
    }
  }

  omitInput<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O | K, W, C, U, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        fieldsToOmit: _.uniq([...(this.options.fieldsToOmit || []), ...fields]),
      },
      this.__resolveVisited,
    );
  }

  omitWrite<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O, W | K, C, U, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        writeFieldsToOmit: _.uniq([
          ...(this.options.writeFieldsToOmit || []),
          ...fields,
        ]),
      },
      this.__resolveVisited,
    );
  }

  omitCreate<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O, W, C | K, U, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        createFieldsToOmit: _.uniq([
          ...(this.options.createFieldsToOmit || []),
          ...fields,
        ]),
      },
      this.__resolveVisited,
    );
  }

  omitUpdate<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O, W, C, U | K, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        updateFieldsToOmit: _.uniq([
          ...(this.options.updateFieldsToOmit || []),
          ...fields,
        ]),
      },
      this.__resolveVisited,
    );
  }

  omitUpsert<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O, W, C, U, US | K, F, R>(
      this.entityClass,
      {
        ...this.options,
        upsertFieldsToOmit: _.uniq([
          ...(this.options.upsertFieldsToOmit || []),
          ...fields,
        ]),
      },
      this.__resolveVisited,
    );
  }

  omitFindAll<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O, W, C, U, US, F | K, R>(
      this.entityClass,
      {
        ...this.options,
        findAllFieldsToOmit: _.uniq([
          ...(this.options.findAllFieldsToOmit || []),
          ...fields,
        ]),
      },
      this.__resolveVisited,
    );
  }

  omitOutput<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O, W, C, U, US, F, R | K>(
      this.entityClass,
      {
        ...this.options,
        outputFieldsToOmit: _.uniq([
          ...(this.options.outputFieldsToOmit || []),
          ...fields,
        ]),
      },
      this.__resolveVisited,
    );
  }

  pathPrefix(prefix: string) {
    return new RestfulFactory<T, O, W, C, U, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        prefix,
      },
      this.__resolveVisited,
    );
  }

  keepEntityVersioningDates(enable = true) {
    return new RestfulFactory<T, O, W, C, U, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        keepEntityVersioningDates: enable,
      },
      this.__resolveVisited,
    );
  }

  skipNonQueryableFields(enable = true) {
    return new RestfulFactory<T, O, W, C, U, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        skipNonQueryableFields: enable,
      },
      this.__resolveVisited,
    );
  }

  renameEntityClass(name: string) {
    return new RestfulFactory<T, O, W, C, U, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        entityClassName: name,
      },
      this.__resolveVisited,
    );
  }

  useRelations(...relations: (string | RelationDef)[]) {
    return new RestfulFactory<T, O, W, C, U, US, F, R>(
      this.entityClass,
      {
        ...this.options,
        relations: [...(this.options.relations || []), ...relations],
      },
      this.__resolveVisited,
    );
  }

  get entityClassName() {
    return this.options.entityClassName || this.entityClass.name;
  }

  @Memorize()
  get fieldsToOmit() {
    return _.uniq([
      ...(getSpecificFields(this.entityClass, 'notColumn') as (keyof T)[]),
      ...(this.options.fieldsToOmit || []),
      ...getTypeormRelations(this.entityClass).map(
        (r) => r.propertyName as keyof T,
      ),
    ]);
  }

  @Memorize()
  get fieldsInCreateToOmit() {
    return _.uniq([
      ...this.fieldsToOmit,
      ...(this.options.writeFieldsToOmit || []),
      ...(this.options.createFieldsToOmit || []),
      ...(getSpecificFields(this.entityClass, 'notWritable') as (keyof T)[]),
      ...(getSpecificFields(this.entityClass, 'notCreatable') as (keyof T)[]),
    ]);
  }

  @Memorize()
  get createDto() {
    return RenameClass(
      OmitTypeExclude(this.entityClass, this.fieldsInCreateToOmit),
      `Create${this.entityClassName}Dto`,
    ) as ClassType<Omit<T, O | W | C>>;
  }

  @Memorize()
  get fieldsInUpdateToOmit() {
    return _.uniq([
      ...this.fieldsToOmit,
      ...(this.options.writeFieldsToOmit || []),
      ...(this.options.updateFieldsToOmit || []),
      ...(getSpecificFields(this.entityClass, 'notWritable') as (keyof T)[]),
      ...(getSpecificFields(this.entityClass, 'notChangeable') as (keyof T)[]),
    ]);
  }

  @Memorize()
  get updateDto() {
    return RenameClass(
      PartialType(OmitTypeExclude(this.entityClass, this.fieldsInUpdateToOmit)),
      `Update${this.entityClassName}Dto`,
    ) as ClassType<Omit<T, O | W | U>>;
  }

  @Memorize()
  get fieldsInUpsertToOmit() {
    return _.uniq([
      ...this.fieldsToOmit,
      ...(this.options.writeFieldsToOmit || []),
      ...(this.options.upsertFieldsToOmit || []),
      ...(getSpecificFields(this.entityClass, 'notWritable') as (keyof T)[]),
      ...(getSpecificFields(this.entityClass, 'notUpsertable') as (keyof T)[]),
    ]);
  }

  @Memorize()
  get upsertDto() {
    return RenameClass(
      OmitTypeExclude(this.entityClass, this.fieldsInUpsertToOmit),
      `Upsert${this.entityClassName}Dto`,
    ) as ClassType<Omit<T, O | W | US>>;
  }

  @Memorize()
  get importDto() {
    return ImportDataDto(this.createDto);
  }

  @Memorize()
  get fieldsInGetToOmit() {
    return _.uniq([
      ...this.fieldsToOmit,
      ...(getSpecificFields(this.entityClass, 'notQueryable') as (keyof T)[]),
      ...(_.difference(
        getSpecificFields(this.entityClass, 'requireGetMutator'),
        getSpecificFields(this.entityClass, 'getMutator'),
      ) as (keyof T)[]),
    ]);
  }

  @Memorize()
  get queryableFields() {
    return _.difference(
      [
        ...getSpecificFields(this.entityClass, 'queryCondition'),
        'pageCount',
        'recordsPerPage',
        'paginationCursor',
      ] as (keyof T)[],
      this.fieldsInGetToOmit,
    );
  }

  @Memorize()
  get findAllDto() {
    let cl = PartialType(
      PatchColumnsInGet(
        OmitTypeExclude(
          this.entityClass instanceof PageSettingsDto
            ? this.entityClass
            : (IntersectionType(
                this.entityClass,
                PageSettingsDto,
              ) as unknown as ClassType<T>),
          this.fieldsInGetToOmit,
        ),
        this.entityClass,
        this.fieldsInGetToOmit as string[],
      ),
    ) as ClassType<T>;
    if (this.options.skipNonQueryableFields) {
      cl = PickTypeExpose(cl, this.queryableFields) as ClassType<T>;
    }
    return RenameClass(cl, `Find${this.entityClassName}Dto`) as ClassType<
      Omit<T, O | F>
    >;
  }

  @Memorize()
  get findAllCursorPaginatedDto() {
    return RenameClass(
      IntersectionType(
        OmitTypeExclude(this.findAllDto, ['pageCount' as keyof Omit<T, O | F>]),
        CursorPaginationDto,
      ),
      `Find${this.entityClassName}CursorPaginatedDto`,
    ) as unknown as ClassType<T>;
  }

  @Memorize()
  get entityResultDto() {
    const relations = getTypeormRelations(this.entityClass);
    const currentLevelRelations =
      this.options.relations &&
      new Set(
        getCurrentLevelRelations(
          this.options.relations.map(extractRelationName),
        ),
      );
    const outputFieldsToOmit = new Set([
      ...(getNotInResultFields(
        this.entityClass,
        this.options.keepEntityVersioningDates,
      ) as (keyof T)[]),
      ...(this.options.outputFieldsToOmit || []),
      ...(this.options.relations
        ? (relations
            .map((r) => r.propertyName)
            .filter((r) => !currentLevelRelations.has(r)) as (keyof T)[])
        : []),
    ]);
    const resultDto = OmitType(this.entityClass, [...outputFieldsToOmit]);
    for (const relation of relations) {
      if (outputFieldsToOmit.has(relation.propertyName as keyof T)) continue;
      if (nonTransformableTypes.has(relation.propertyClass)) continue;
      const replace = (useClass: [AnyClass]) => {
        const oldApiProperty = getApiProperty(
          this.entityClass,
          relation.propertyName,
        );
        ApiProperty({
          ...oldApiProperty,
          // required: false,
          type: () => (relation.isArray ? [useClass[0]] : useClass[0]),
        } as ApiPropertyOptions)(resultDto.prototype, relation.propertyName);
      };
      const existing = this.__resolveVisited.get(relation.propertyClass);
      if (existing) {
        replace(existing);
      } else {
        if (
          !this.__resolveVisited.has(this.entityClass) &&
          !this.options.relations
        ) {
          this.__resolveVisited.set(this.entityClass, [null]);
        }
        const relationFactory = new RestfulFactory(
          relation.propertyClass,
          {
            entityClassName: `${this.entityClassName}${
              this.options.relations
                ? upperFirst(relation.propertyName)
                : relation.propertyClass.name
            }`,
            relations:
              this.options.relations &&
              getNextLevelRelations(
                this.options.relations.map(extractRelationName),
                relation.propertyName,
              ),
            keepEntityVersioningDates: this.options.keepEntityVersioningDates,
          },
          this.__resolveVisited,
        );
        const relationResultDto = relationFactory.entityResultDto;
        replace([relationResultDto]);
        if (!this.options.relations) {
          this.__resolveVisited.set(relation.propertyClass, [
            relationResultDto,
          ]);
        }
      }
    }
    const notRequiredButHasDefaultFields = getSpecificFields(
      this.entityClass,
      'notRequiredButHasDefault',
    ).filter((f) => !outputFieldsToOmit.has(f as keyof T));
    for (const field of notRequiredButHasDefaultFields) {
      const oldApiProperty = getApiProperty(resultDto, field);
      ApiProperty({
        ...oldApiProperty,
        required: true,
      } as ApiPropertyOptions)(resultDto.prototype, field);
    }
    const res = RenameClass(
      resultDto,
      `${this.entityClassName}ResultDto`,
    ) as ClassType<Omit<T, R>>;
    const currentContainer = this.__resolveVisited.get(this.entityClass);
    if (currentContainer) {
      currentContainer[0] = res;
    }
    return res;
  }

  @Memorize()
  get entityCreateResultDto() {
    return RenameClass(
      OmitType(this.entityResultDto, [
        ...getTypeormRelations(this.entityClass).map(
          (r) => r.propertyName as keyof T,
        ),
        ...(getSpecificFields(
          this.entityClass,
          'notColumn',
          (m) => !m.keepInCreate,
        ) as any[]),
      ]),
      `${this.entityClassName}CreateResultDto`,
    ) as ClassType<Omit<T, R>>;
  }

  @Memorize()
  get entityUpsertResultDto() {
    return RenameClass(
      OmitType(this.entityResultDto, [
        ...(this.options.upsertIncludeRelations
          ? []
          : getTypeormRelations(this.entityClass).map(
              (r) => r.propertyName as keyof T,
            )),
        ...(getSpecificFields(
          this.entityClass,
          'notColumn',
          (m) => m.hideInUpsert,
        ) as any[]),
      ]),
      `${this.entityClassName}UpsertResultDto`,
    ) as ClassType<Omit<T, R>>;
  }

  @Memorize()
  get entityReturnMessageDto() {
    return ReturnMessageDto(this.entityResultDto);
  }

  @Memorize()
  get entityCreateReturnMessageDto() {
    return ReturnMessageDto(this.entityCreateResultDto);
  }

  @Memorize()
  get entityArrayReturnMessageDto() {
    return PaginatedReturnMessageDto(this.entityResultDto);
  }

  @Memorize()
  get entityCursorPaginationReturnMessageDto() {
    return CursorPaginationReturnMessageDto(this.entityResultDto);
  }

  @Memorize()
  get importReturnMessageDto() {
    return ReturnMessageDto([ImportEntryDto(this.entityCreateResultDto)]);
  }

  @Memorize()
  // eslint-disable-next-line @typescript-eslint/ban-types
  get idType(): StringConstructor | NumberConstructor {
    return Reflect.getMetadata('design:type', this.entityClass.prototype, 'id');
  }

  private usePrefix(
    methodDec: (path?: string) => MethodDecorator,
    ...paths: string[]
  ) {
    const usePaths = [this.options.prefix, ...paths].filter(
      (s) => s && s.length > 0,
    );
    if (usePaths.length > 0) {
      return methodDec(usePaths.join('/'));
    } else {
      return methodDec();
    }
  }

  create(extras: ResourceOptions = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Post, extras.prefix),
      HttpCode(200),
      ApiOperation({
        summary: `Create a new ${this.entityClassName}`,
        ..._.omit(extras, 'prefix'),
      }),
      ApiBody({ type: this.createDto }),
      ApiOkResponse({ type: this.entityCreateReturnMessageDto }),
      ApiError(400, `The ${this.entityClassName} is not valid`),
    ]);
  }

  createParam() {
    return Body(DataPipe(), OmitPipe(this.fieldsInCreateToOmit));
  }

  isUpsertable() {
    return !!reflector.get('upsertableEntity', this.entityClass);
  }

  upsert(extras: ResourceOptions = {}): MethodDecorator {
    if (!this.isUpsertable()) {
      throw new Error(
        `Entity ${this.entityClass.name} is not upsertable. Please define at least one UpsertColumn or BindingColumn, and set @UpsertableEntity() decorator.`,
      );
    }
    return MergeMethodDecorators([
      this.usePrefix(Put, extras.prefix),
      HttpCode(200),
      ApiOperation({
        summary: `Upsert a ${this.entityClassName}`,
        ..._.omit(extras, 'prefix'),
      }),
      ApiBody({ type: this.upsertDto }),
      ApiOkResponse({ type: this.entityUpsertResultDto }),
      ApiError(400, `The ${this.entityClassName} is not valid`),
    ]);
  }

  upsertParam() {
    return Body(DataPipe(), OmitPipe(this.fieldsInUpsertToOmit));
  }

  findOne(extras: ResourceOptions = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Get, extras.prefix, ':id'),
      ApiOperation({
        summary: `Find a ${this.entityClassName} by id`,
        ..._.omit(extras, 'prefix'),
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiOkResponse({ type: this.entityReturnMessageDto }),
      ApiError(
        400,
        `The ${this.entityClassName} with the given id was not found`,
      ),
    ]);
  }

  idParam() {
    if (this.idType === Number) {
      return Param('id', ParseIntPipe);
    } else {
      return Param('id');
    }
  }

  findAll(extras: ResourceOptions = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Get, extras.prefix),
      ApiOperation({
        summary: `Find all ${this.entityClassName}`,
        ..._.omit(extras, 'prefix'),
      }),
      ApiOkResponse({ type: this.entityArrayReturnMessageDto }),
    ]);
  }

  findAllCursorPaginated(extras: ResourceOptions = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Get, extras.prefix),
      ApiOperation({
        summary: `Find all ${this.entityClassName}`,
        ..._.omit(extras, 'prefix'),
      }),
      ApiOkResponse({ type: this.entityCursorPaginationReturnMessageDto }),
    ]);
  }

  private getMutatorColumns() {
    const mutatorColumns = getSpecificFields(this.entityClass, 'getMutator');
    return _.difference(mutatorColumns, this.fieldsInGetToOmit as string[]);
  }

  findAllParam() {
    const mutatorColumns = this.getMutatorColumns();
    const restPipes = [OptionalDataPipe(), OmitPipe(this.fieldsInGetToOmit)];
    if (this.options.skipNonQueryableFields) {
      restPipes.push(PickPipe(this.queryableFields));
    }
    if (mutatorColumns.length) {
      return Query(new MutatorPipe(this.entityClass), ...restPipes);
    } else {
      return Query(...restPipes);
    }
  }

  update(extras: ResourceOptions = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Patch, extras.prefix, ':id'),
      HttpCode(200),
      ApiOperation({
        summary: `Update a ${this.entityClassName} by id`,
        ..._.omit(extras, 'prefix'),
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiBody({ type: this.updateDto }),
      ApiBlankResponse(),
      ApiError(
        404,
        `The ${this.entityClassName} with the given id was not found`,
      ),
      ApiError(400, `The ${this.entityClassName} is not valid`),
      ApiError(500, 'Internal error'),
    ]);
  }

  updateParam() {
    return Body(OptionalDataPipe(), OmitPipe(this.fieldsInUpdateToOmit));
  }

  delete(extras: ResourceOptions = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Delete, extras.prefix, ':id'),
      HttpCode(200),
      ApiOperation({
        summary: `Delete a ${this.entityClassName} by id`,
        ..._.omit(extras, 'prefix'),
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiBlankResponse(),
      ApiError(
        404,
        `The ${this.entityClassName} with the given id was not found`,
      ),
      ApiError(500, 'Internal error'),
    ]);
  }

  import(extras: ResourceOptions = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Post, extras.prefix, 'import'),
      HttpCode(200),
      ApiOperation({
        summary: `Import ${this.entityClassName}`,
        ..._.omit(extras, 'prefix'),
      }),
      ApiBody({ type: this.importDto }),
      ApiOkResponse({ type: this.importReturnMessageDto }),
      ApiError(500, 'Internal error'),
    ]);
  }

  operation(
    operationName: string,
    options: ResourceOptions & {
      returnType?: AnyClass;
    } = {},
  ): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Post, options.prefix, ':id', operationName),
      HttpCode(200),
      ApiOperation({
        summary: `${upperFirst(operationName)} a ${this.entityClassName} by id`,
        ..._.omit(options, 'prefix', 'returnType'),
      }),
      options.returnType
        ? ApiTypeResponse(options.returnType)
        : ApiBlankResponse(),
      ApiError(
        404,
        `The ${this.entityClassName} with the given id was not found`,
      ),
    ]);
  }

  baseController<
    Options extends Partial<{
      paginateType: RestfulPaginateType;
      globalMethodDecorators: MethodDecorator[];
      routes: Partial<
        Record<
          RestfulMethods,
          Partial<{
            enabled: boolean;
            methodDecorators: MethodDecorator[];
          }>
        >
      >;
      // eslint-disable-next-line @typescript-eslint/ban-types
    }> = {},
  >(routeOptions: Options = {} as Options) {
    // 计算出哪些是 disabled 的方法
    type Routes = NonNullable<Options['routes']>;
    type ExplicitlyEnabledOrDisabledMethods<E> = {
      [M in keyof Routes]: Routes[M] extends { enabled: E } ? M : never;
    }[keyof Routes] &
      RestfulMethods;
    type ExplicitlyDisabledMethods = ExplicitlyEnabledOrDisabledMethods<false>;
    type ExplicitlyEnabledMethods = ExplicitlyEnabledOrDisabledMethods<true>;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const _this = this;

    const cl =
      class SpecificRestfulController extends BaseRestfulController<T> {
        constructor(service: CrudBase<T> | Repository<T>) {
          super(service, {
            paginateType: routeOptions.paginateType || 'offset',
            relations: _this.options.relations,
            entityClass: _this.entityClass,
          });
        }
      } as new (service: CrudBase<T> | Repository<T>) => ([
        ExplicitlyEnabledMethods,
      ] extends [never]
        ? Omit<BaseRestfulController<T>, ExplicitlyDisabledMethods>
        : Pick<BaseRestfulController<T>, ExplicitlyEnabledMethods>) & {
        _service: CrudBase<T>;
      };

    const anyTrueWritten = RestfulMethods.some(
      (m) => routeOptions?.routes?.[m]?.enabled === true,
    );

    const validMethods = RestfulMethods.filter((m) => {
      if (m === 'upsert' && !this.isUpsertable()) return false;
      const value = routeOptions?.routes?.[m]?.enabled;
      if (value === false) return false;
      if (value === true) return true;
      return !anyTrueWritten || value === true;
    });

    const useDecorators: Record<
      RestfulMethods,
      {
        paramDecorators: () => ParameterDecorator[];
        paramTypes: AnyClass[];
        methodDecorators: () => MethodDecorator[];
      }
    > = {
      findOne: {
        paramTypes: [this.idType as AnyClass],
        paramDecorators: () => [this.idParam()],
        methodDecorators: () => [this.findOne()],
      },
      findAll: {
        paramTypes: [
          routeOptions.paginateType === 'cursor'
            ? this.findAllCursorPaginatedDto
            : routeOptions.paginateType === 'none'
            ? OmitType(this.findAllDto, [
                'pageCount',
                'recordsPerPage',
              ] as (keyof Omit<T, O | F>)[])
            : this.findAllDto,
        ],
        paramDecorators: () => [this.findAllParam()],
        methodDecorators: () => [
          routeOptions.paginateType === 'cursor'
            ? this.findAllCursorPaginated()
            : this.findAll(),
        ],
      },
      create: {
        paramTypes: [this.createDto],
        paramDecorators: () => [this.createParam()],
        methodDecorators: () => [this.create()],
      },
      update: {
        paramTypes: [this.idType as AnyClass, this.updateDto],
        paramDecorators: () => [this.idParam(), this.updateParam()],
        methodDecorators: () => [this.update()],
      },
      upsert: {
        paramTypes: [this.upsertDto],
        paramDecorators: () => [this.upsertParam()],
        methodDecorators: () => [this.upsert()],
      },
      delete: {
        paramTypes: [this.idType as AnyClass],
        paramDecorators: () => [this.idParam()],
        methodDecorators: () => [this.delete()],
      },
      import: {
        paramTypes: [this.importDto],
        paramDecorators: () => [this.createParam()],
        methodDecorators: () => [this.import()],
      },
    };

    for (const method of validMethods) {
      // 1. Override 继承方法，让它成为自己的（以便能装饰）
      const methodImpl = function namedMethodImpl(...args: any[]) {
        return BaseRestfulController.prototype[method].apply(this, args);
      };
      Object.defineProperty(methodImpl, 'name', {
        value: method,
        configurable: true,
      });
      cl.prototype[method] = methodImpl;

      const paramDecorators = useDecorators[method].paramDecorators();
      const paramTypes = useDecorators[method].paramTypes;
      const methodDecorators = [
        ...useDecorators[method].methodDecorators(),
        ...(routeOptions?.routes?.[method]?.methodDecorators || []),
        ...(routeOptions?.globalMethodDecorators || []),
      ];

      // 2. 先打参数装饰器
      paramDecorators.forEach((paramDecorator, index) => {
        paramDecorator(cl.prototype, method, index);
      });

      // 3. 打 Reflect Metadata（design:paramtypes）
      Reflect.defineMetadata(
        'design:paramtypes',
        paramTypes,
        cl.prototype,
        method,
      );

      // 4. 打 Reflect Metadata（design:type 和 design:returntype）
      const baseDescriptor = Object.getOwnPropertyDescriptor(
        BaseRestfulController.prototype,
        method,
      );
      if (baseDescriptor) {
        // 方法是 function
        Reflect.defineMetadata(
          'design:type',
          baseDescriptor.value,
          cl.prototype,
          method,
        );

        // 这里 return type 通常可以是 Promise<any>，但如果你有更具体的类型，可以扩展
        Reflect.defineMetadata(
          'design:returntype',
          Promise,
          cl.prototype,
          method,
        );
      }

      // 5. 再打方法装饰器
      methodDecorators.forEach((methodDecorator) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          cl.prototype,
          method,
        )!;
        methodDecorator(cl.prototype, method, descriptor);
        Object.defineProperty(cl.prototype, method, descriptor);
      });
    }

    return RenameClass(cl, `${this.entityClassName}Controller`);
  }

  crudService(options: CrudOptions<T> = {}) {
    const keysToMigrate: (keyof (CrudOptions<T> | RestfulFactoryOptions<T>))[] =
      [
        'relations',
        'outputFieldsToOmit',
        'upsertIncludeRelations',
        'keepEntityVersioningDates',
      ];
    return CrudService(this.entityClass, {
      ..._.pick(this.options, keysToMigrate),
      ...options,
    });
  }
}
