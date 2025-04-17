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
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { CreatePipe, GetPipe, UpdatePipe } from './pipes';
import { OperationObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import _ from 'lodash';
import { getNotInResultFields, getSpecificFields } from '../utility/metadata';
import { RenameClass } from '../utility/rename-class';
import { getMetadataArgsStorage } from 'typeorm';
import { DECORATORS } from '@nestjs/swagger/dist/constants';

export interface RestfulFactoryOptions<T> {
  fieldsToOmit?: (keyof T)[];
  prefix?: string;
  keepEntityVersioningDates?: boolean;
  outputFieldsToOmit?: (keyof T)[];
  entityClassName?: string;
}

export class RestfulFactory<T> {
  private getEntityClassName() {
    return this.options.entityClassName || this.entityClass.name;
  }

  readonly fieldsToOmit = _.uniq([
    ...(getSpecificFields(this.entityClass, 'notColumn') as (keyof T)[]),
    ...(this.options.fieldsToOmit || []),
    ...getMetadataArgsStorage()
      .relations.filter((r) => r.target === this.entityClass)
      .map((r) => r.propertyName as keyof T),
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
  readonly importDto = ImportDataDto(this.entityClass);
  readonly findAllDto = RenameClass(
    PartialType(
      OmitType(
        this.basicInputDto,
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
    const outputFieldsToOmit = new Set([
      ...(getNotInResultFields(
        this.entityClass,
        this.options.keepEntityVersioningDates,
      ) as (keyof T)[]),
      ...(this.options.outputFieldsToOmit || []),
    ]);
    const resultDto = OmitType(this.entityClass, [...outputFieldsToOmit]);
    const { relations } = getMetadataArgsStorage();
    for (const relation of relations) {
      if (
        outputFieldsToOmit.has(relation.propertyName as keyof T) ||
        relation.target !== this.entityClass
      )
        continue;
      const relationClassFactory = relation.type;
      // check if it's a callable function
      if (typeof relationClassFactory !== 'function') continue;
      const relationClass = (relationClassFactory as () => AnyClass)();
      if (typeof relationClass !== 'function') continue;
      const replace = (useClass) => {
        const oldApiProperty =
          Reflect.getMetadata(
            DECORATORS.API_MODEL_PROPERTIES,
            this.entityClass.prototype,
            relation.propertyName,
          ) || {};
        ApiProperty({
          ...oldApiProperty,
          required: false,
          type: relation.relationType.endsWith('-many') ? [useClass] : useClass,
        })(resultDto.prototype, relation.propertyName);
      };
      const existing = this.__resolveVisited.get(relationClass);
      if (existing) {
        replace(existing);
      } else {
        if (!this.__resolveVisited.has(this.entityClass)) {
          this.__resolveVisited.set(this.entityClass, Object);
        }
        const relationFactory = new RestfulFactory(
          relationClass,
          {},
          this.__resolveVisited,
        );
        const relationResultDto = relationFactory.entityResultDto;
        replace(relationResultDto);
        this.__resolveVisited.set(relationClass, relationResultDto);
      }
    }
    return RenameClass(
      resultDto,
      `${this.getEntityClassName()}ResultDto`,
    ) as ClassType<T>;
  }

  readonly entityResultDto = this.resolveEntityResultDto();

  readonly entityReturnMessageDto = ReturnMessageDto(this.entityResultDto);
  readonly entityArrayReturnMessageDto = PaginatedReturnMessageDto(
    this.entityResultDto,
  );
  readonly importReturnMessageDto = ReturnMessageDto([
    ImportEntryDto(this.entityResultDto),
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
    private __resolveVisited = new Map<AnyClass, AnyClass>(),
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
      ApiOkResponse({ type: this.entityReturnMessageDto }),
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
      ApiBody({ type: ImportDataDto(this.createDto) }),
      ApiOkResponse({ type: this.importReturnMessageDto }),
      ApiInternalServerErrorResponse({
        type: BlankReturnMessageDto,
        description: 'Internal error',
      }),
    ]);
  }
}
