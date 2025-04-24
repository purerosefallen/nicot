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
import { ImportDataDto, ImportEntryDto } from '../dto';
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
import { CreatePipe, GetPipe, UpdatePipe } from './pipes';
import { OperationObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import _, { upperFirst } from 'lodash';
import { getNotInResultFields, getSpecificFields } from '../utility/metadata';
import { RenameClass } from '../utility/rename-class';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { getTypeormRelations } from '../utility/get-typeorm-relations';
import { RelationDef } from '../crud-base';
import { PageSettingsDto } from '../bases';

export interface RestfulFactoryOptions<T> {
  fieldsToOmit?: (keyof T)[];
  prefix?: string;
  keepEntityVersioningDates?: boolean;
  outputFieldsToOmit?: (keyof T)[];
  entityClassName?: string;
  relations?: (string | RelationDef)[];
}

const extractRelationName = (relation: string | RelationDef) => {
  if (typeof relation === 'string') {
    return relation;
  } else {
    return relation.name;
  }
};

const getCurrentLevelRelations = (relations: string[]) =>
  relations.filter((r) => !r.includes('.'));

const getNextLevelRelations = (relations: string[], enteringField: string) =>
  relations
    .filter((r) => r.includes('.') && r.startsWith(`${enteringField}.`))
    .map((r) => r.split('.').slice(1).join('.'));

export class RestfulFactory<T> {
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
  private readonly basicInputDto = OmitType(
    this.entityClass,
    this.fieldsToOmit,
  ) as ClassType<T>;

  readonly createDto = RenameClass(
    OmitType(
      this.basicInputDto,
      getSpecificFields(this.entityClass, 'notWritable') as (keyof T)[],
    ),
    `Create${this.entityClass.name}Dto`,
  ) as ClassType<T>;
  readonly importDto = ImportDataDto(this.createDto);
  readonly findAllDto = RenameClass(
    PartialType(
      OmitType(
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
  readonly updateDto = RenameClass(
    PartialType(
      OmitType(
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
        ApiProperty({
          ...oldApiProperty,
          required: false,
          type: () => (relation.isArray ? [useClass[0]] : useClass[0]),
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
      ...(getSpecificFields(this.entityClass, 'notColumn') as (keyof T)[]),
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
  ) {}

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
}
