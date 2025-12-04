import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ImportDataDto, ImportEntryDto } from './dto';
import {
  AnyClass,
  BlankReturnMessageDto,
  MergeMethodDecorators,
  PaginatedReturnMessageDto,
  ReturnMessageDto,
  ClassType,
  getApiProperty,
  DataPipe,
} from 'nesties';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
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
import { getNotInResultFields, getSpecificFields } from './utility/metadata';
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
import { Memorize } from './utility/memorize';
import { MutatorPipe } from './utility/mutate-pipe';

export interface RestfulFactoryOptions<
  T,
  O extends keyof T = never,
  W extends keyof T = never,
  C extends keyof T = never,
  U extends keyof T = never,
  F extends keyof T = never,
  R extends keyof T = never,
> {
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

const getCurrentLevelRelations = (relations: string[]) =>
  relations.filter((r) => !r.includes('.'));

const getNextLevelRelations = (relations: string[], enteringField: string) =>
  relations
    .filter((r) => r.includes('.') && r.startsWith(`${enteringField}.`))
    .map((r) => r.split('.').slice(1).join('.'));

export class RestfulFactory<
  T extends { id: any },
  O extends keyof T = never,
  W extends keyof T = never,
  C extends keyof T = never,
  U extends keyof T = never,
  F extends keyof T = never,
  R extends keyof T = never,
> {
  constructor(
    public readonly entityClass: ClassType<T>,
    private options: RestfulFactoryOptions<T, O, W, C, U, F, R> = {},
    private __resolveVisited = new Map<AnyClass, [AnyClass]>(),
  ) {
    if (options.relations) {
      // we have to filter once to ensure every relation is correct
      filterRelations(entityClass, options.relations);
    }
  }

  omitInput<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O | K, W, C, U, F, R>(
      this.entityClass,
      {
        ...this.options,
        fieldsToOmit: _.uniq([...(this.options.fieldsToOmit || []), ...fields]),
      },
      this.__resolveVisited,
    );
  }

  omitWrite<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O, W | K, C, U, F, R>(
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
    return new RestfulFactory<T, O, W, C | K, U, F, R>(
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
    return new RestfulFactory<T, O, W, C, U | K, F, R>(
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

  omitFindAll<K extends keyof T>(...fields: K[]) {
    return new RestfulFactory<T, O, W, C, U, F | K, R>(
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
    return new RestfulFactory<T, O, W, C, U, F, R | K>(
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
    return new RestfulFactory<T, O, W, C, U, F, R>(
      this.entityClass,
      {
        ...this.options,
        prefix,
      },
      this.__resolveVisited,
    );
  }

  keepEntityVersioningDates(enable = true) {
    return new RestfulFactory<T, O, W, C, U, F, R>(
      this.entityClass,
      {
        ...this.options,
        keepEntityVersioningDates: enable,
      },
      this.__resolveVisited,
    );
  }

  skipNonQueryableFields(enable = true) {
    return new RestfulFactory<T, O, W, C, U, F, R>(
      this.entityClass,
      {
        ...this.options,
        skipNonQueryableFields: enable,
      },
      this.__resolveVisited,
    );
  }

  renameEntityClass(name: string) {
    return new RestfulFactory<T, O, W, C, U, F, R>(
      this.entityClass,
      {
        ...this.options,
        entityClassName: name,
      },
      this.__resolveVisited,
    );
  }

  useRelations(...relations: (string | RelationDef)[]) {
    return new RestfulFactory<T, O, W, C, U, F, R>(
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
      getSpecificFields(this.entityClass, 'queryCondition') as (keyof T)[],
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
    path?: string,
  ) {
    if (path) {
      if (this.options.prefix) {
        return methodDec(`${this.options.prefix}/${path}`);
      } else {
        return methodDec(path);
      }
    } else {
      if (this.options.prefix) {
        return methodDec(this.options.prefix);
      } else {
        return methodDec();
      }
    }
  }

  create(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Post),
      HttpCode(200),
      ApiOperation({
        summary: `Create a new ${this.entityClassName}`,
        ...extras,
      }),
      ApiBody({ type: this.createDto }),
      ApiOkResponse({ type: this.entityCreateReturnMessageDto }),
      ApiBadRequestResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClassName} is not valid`,
      }),
    ]);
  }

  createParam() {
    return Body(DataPipe(), OmitPipe(this.fieldsInCreateToOmit));
  }

  findOne(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Get, ':id'),
      ApiOperation({
        summary: `Find a ${this.entityClassName} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiOkResponse({ type: this.entityReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClassName} with the given id was not found`,
      }),
    ]);
  }

  idParam() {
    if (this.idType === Number) {
      return Param('id', ParseIntPipe);
    } else {
      return Param('id');
    }
  }

  findAll(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Get),
      ApiOperation({
        summary: `Find all ${this.entityClassName}`,
        ...extras,
      }),
      ApiOkResponse({ type: this.entityArrayReturnMessageDto }),
    ]);
  }

  findAllCursorPaginated(
    extras: Partial<OperationObject> = {},
  ): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Get),
      ApiOperation({
        summary: `Find all ${this.entityClassName}`,
        ...extras,
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

  update(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Patch, ':id'),
      HttpCode(200),
      ApiOperation({
        summary: `Update a ${this.entityClassName} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiBody({ type: this.updateDto }),
      ApiOkResponse({ type: BlankReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClassName} with the given id was not found`,
      }),
      ApiBadRequestResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClassName} is not valid`,
      }),
      ApiInternalServerErrorResponse({
        type: BlankReturnMessageDto,
        description: 'Internal error',
      }),
    ]);
  }

  updateParam() {
    return Body(OptionalDataPipe(), OmitPipe(this.fieldsInUpdateToOmit));
  }

  delete(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Delete, ':id'),
      HttpCode(200),
      ApiOperation({
        summary: `Delete a ${this.entityClassName} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiOkResponse({ type: BlankReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClassName} with the given id was not found`,
      }),
      ApiInternalServerErrorResponse({
        type: BlankReturnMessageDto,
        description: 'Internal error',
      }),
    ]);
  }

  import(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      Post('import'),
      HttpCode(200),
      ApiOperation({
        summary: `Import ${this.entityClassName}`,
        ...extras,
      }),
      ApiBody({ type: this.importDto }),
      ApiOkResponse({ type: this.importReturnMessageDto }),
      ApiInternalServerErrorResponse({
        type: BlankReturnMessageDto,
        description: 'Internal error',
      }),
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
    return CrudService(this.entityClass, {
      relations: this.options.relations,
      outputFieldsToOmit: this.options.outputFieldsToOmit,
      ...options,
    });
  }
}
