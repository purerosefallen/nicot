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
  IntersectionType,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { CreatePipe, GetPipe, UpdatePipe } from './decorators';
import { OperationObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import _, { upperFirst } from 'lodash';
import { getNotInResultFields, getSpecificFields } from './utility/metadata';
import { RenameClass } from './utility/rename-class';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
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
import { OmitTypeExclude } from './utility/omit-type-exclude';
import { nonTransformableTypes } from './utility/non-transformable-types';

export interface RestfulFactoryOptions<T> {
  fieldsToOmit?: (keyof T)[];
  prefix?: string;
  keepEntityVersioningDates?: boolean;
  outputFieldsToOmit?: (keyof T)[];
  entityClassName?: string;
  relations?: (string | RelationDef)[];
}

const getCurrentLevelRelations = (relations: string[]) =>
  relations.filter((r) => !r.includes('.'));

const getNextLevelRelations = (relations: string[], enteringField: string) =>
  relations
    .filter((r) => r.includes('.') && r.startsWith(`${enteringField}.`))
    .map((r) => r.split('.').slice(1).join('.'));

export class RestfulFactory<T extends { id: any }> {
  private getEntityClassName() {
    return this.options.entityClassName || this.entityClass.name;
  }

  readonly fieldsToOmit = _.uniq([
    ...(getSpecificFields(this.entityClass, 'notColumn') as (keyof T)[]),
    ...(this.options.fieldsToOmit || []),
    ...getTypeormRelations(this.entityClass).map(
      (r) => r.propertyName as keyof T,
    ),
  ]);
  private readonly basicInputDto = OmitTypeExclude(
    this.entityClass,
    this.fieldsToOmit,
  ) as ClassType<T>;

  readonly createDto = RenameClass(
    OmitTypeExclude(
      this.basicInputDto,
      getSpecificFields(this.entityClass, 'notWritable') as (keyof T)[],
    ),
    `Create${this.entityClass.name}Dto`,
  ) as ClassType<T>;
  readonly importDto = ImportDataDto(this.createDto);
  readonly findAllDto = RenameClass(
    PartialType(
      OmitTypeExclude(
        this.entityClass instanceof PageSettingsDto
          ? this.basicInputDto
          : (IntersectionType(
              this.basicInputDto,
              PageSettingsDto,
            ) as unknown as ClassType<T>),
        getSpecificFields(this.entityClass, 'notQueryable') as (keyof T)[],
      ),
    ),
    `Find${this.entityClass.name}Dto`,
  ) as ClassType<T>;
  readonly findAllCursorPaginatedDto = RenameClass(
    IntersectionType(
      OmitTypeExclude(this.findAllDto, ['pageCount' as keyof T]),
      CursorPaginationDto,
    ),
    `Find${this.entityClass.name}CursorPaginatedDto`,
  ) as unknown as ClassType<T>;
  readonly updateDto = RenameClass(
    PartialType(
      OmitTypeExclude(
        this.createDto,
        getSpecificFields(this.entityClass, 'notChangeable') as (keyof T)[],
      ),
    ),
    `Update${this.entityClass.name}Dto`,
  ) as ClassType<T>;

  private resolveEntityResultDto() {
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
      const replace = (useClass: [AnyClass]) => {
        const oldApiProperty =
          Reflect.getMetadata(
            DECORATORS.API_MODEL_PROPERTIES,
            this.entityClass.prototype,
            relation.propertyName,
          ) || {};
        const typeFactory = () =>
          relation.isArray ? [useClass[0]] : useClass[0];
        console.log(
          'test restful',
          this.entityClass.name,
          relation.propertyName,
          typeFactory(),
        );
        ApiProperty({
          ...oldApiProperty,
          required: false,
          type: typeFactory,
        })(resultDto.prototype, relation.propertyName);
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
            entityClassName: `${this.getEntityClassName()}${
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
    const res = RenameClass(
      resultDto,
      `${this.getEntityClassName()}ResultDto`,
    ) as ClassType<T>;
    const currentContainer = this.__resolveVisited.get(this.entityClass);
    if (currentContainer) {
      currentContainer[0] = res;
    }
    return res;
  }

  readonly entityResultDto = this.resolveEntityResultDto();
  readonly entityCreateResultDto = RenameClass(
    OmitType(this.entityResultDto, [
      ...getTypeormRelations(this.entityClass).map(
        (r) => r.propertyName as keyof T,
      ),
      ...(getSpecificFields(
        this.entityClass,
        'notColumn',
        (m) => !m.keepInCreate,
      ) as (keyof T)[]),
    ]),
    `${this.getEntityClassName()}CreateResultDto`,
  );

  readonly entityReturnMessageDto = ReturnMessageDto(this.entityResultDto);
  readonly entityCreateReturnMessageDto = ReturnMessageDto(
    this.entityCreateResultDto,
  );
  readonly entityArrayReturnMessageDto = PaginatedReturnMessageDto(
    this.entityResultDto,
  );
  readonly entityCursorPaginationReturnMessageDto =
    CursorPaginationReturnMessageDto(this.entityResultDto);
  readonly importReturnMessageDto = ReturnMessageDto([
    ImportEntryDto(this.entityCreateResultDto),
  ]);
  // eslint-disable-next-line @typescript-eslint/ban-types
  readonly idType: Function = Reflect.getMetadata(
    'design:type',
    this.entityClass.prototype,
    'id',
  );

  constructor(
    public readonly entityClass: ClassType<T>,
    private options: RestfulFactoryOptions<T> = {},
    private __resolveVisited = new Map<AnyClass, [AnyClass]>(),
  ) {
    if (options.relations) {
      // we have to filter once to ensure every relation is correct
      filterRelations(entityClass, options.relations);
    }
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
        summary: `Create a new ${this.getEntityClassName()}`,
        ...extras,
      }),
      ApiBody({ type: this.createDto }),
      ApiOkResponse({ type: this.entityCreateReturnMessageDto }),
      ApiBadRequestResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.getEntityClassName()} is not valid`,
      }),
    ]);
  }

  createParam() {
    return Body(CreatePipe());
  }

  findOne(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Get, ':id'),
      ApiOperation({
        summary: `Find a ${this.getEntityClassName()} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiOkResponse({ type: this.entityReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.getEntityClassName()} with the given id was not found`,
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
        summary: `Find all ${this.getEntityClassName()}`,
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
        summary: `Find all ${this.getEntityClassName()}`,
        ...extras,
      }),
      ApiOkResponse({ type: this.entityCursorPaginationReturnMessageDto }),
    ]);
  }

  findAllParam() {
    return Query(GetPipe());
  }

  update(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Patch, ':id'),
      HttpCode(200),
      ApiOperation({
        summary: `Update a ${this.getEntityClassName()} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiBody({ type: this.updateDto }),
      ApiOkResponse({ type: BlankReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.getEntityClassName()} with the given id was not found`,
      }),
      ApiBadRequestResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.getEntityClassName()} is not valid`,
      }),
      ApiInternalServerErrorResponse({
        type: BlankReturnMessageDto,
        description: 'Internal error',
      }),
    ]);
  }

  updateParam() {
    return Body(UpdatePipe());
  }

  delete(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      this.usePrefix(Delete, ':id'),
      HttpCode(200),
      ApiOperation({
        summary: `Delete a ${this.getEntityClassName()} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiOkResponse({ type: BlankReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.getEntityClassName()} with the given id was not found`,
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
        summary: `Import ${this.getEntityClassName()}`,
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
      } as new (service: CrudBase<T> | Repository<T>) => [
        ExplicitlyEnabledMethods,
      ] extends [never]
        ? Omit<BaseRestfulController<T>, ExplicitlyDisabledMethods>
        : Pick<BaseRestfulController<T>, ExplicitlyEnabledMethods>;

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
              ] as (keyof T)[])
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

    return RenameClass(cl, `${this.getEntityClassName()}Controller`);
  }

  crudService(options: CrudOptions<T> = {}) {
    return CrudService(this.entityClass, {
      relations: this.options.relations,
      ...options,
    });
  }
}
