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
import {
  BlankReturnMessageDto,
  ImportDataDto,
  ImportEntryDto,
  PaginatedReturnMessageDto,
  ReturnMessageDto,
} from '../dto';
import { MergeMethodDecorators } from './merge';
import { ClassType } from '../utility/insert-field';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { CreatePipe, GetPipe, UpdatePipe } from './pipes';
import { OperationObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import _ from 'lodash';
import { getSpecificFields } from '../utility/metadata';
import { RenameClass } from '../utility/rename-class';

export interface RestfulFactoryOptions<T> {
  fieldsToOmit?: (keyof T)[];
  prefix?: string;
}

export class RestfulFactory<T> {
  readonly entityReturnMessageDto = ReturnMessageDto(this.entityClass);
  readonly entityArrayReturnMessageDto = PaginatedReturnMessageDto(
    this.entityClass,
  );
  readonly importReturnMessageDto = ReturnMessageDto([
    ImportEntryDto(this.entityClass),
  ]);
  readonly fieldsToOmit = _.uniq([
    ...(getSpecificFields(this.entityClass, 'notColumn') as (keyof T)[]),
    ...(this.options.fieldsToOmit || []),
  ]);
  private readonly basicDto = OmitType(
    this.entityClass,
    this.fieldsToOmit,
  ) as ClassType<T>;
  readonly createDto = RenameClass(
    OmitType(
      this.basicDto,
      getSpecificFields(this.entityClass, 'notWritable') as (keyof T)[],
    ),
    `Create${this.entityClass.name}Dto`,
  ) as ClassType<T>;
  readonly importDto = ImportDataDto(this.entityClass);
  readonly findAllDto = RenameClass(
    PartialType(
      OmitType(
        this.basicDto,
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
  // eslint-disable-next-line @typescript-eslint/ban-types
  readonly idType: Function = Reflect.getMetadata(
    'design:type',
    this.entityClass.prototype,
    'id',
  );

  constructor(
    public readonly entityClass: ClassType<T>,
    private options: RestfulFactoryOptions<T> = {},
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
        summary: `Create a new ${this.entityClass.name}`,
        ...extras,
      }),
      ApiBody({ type: this.createDto }),
      ApiOkResponse({ type: this.entityReturnMessageDto }),
      ApiBadRequestResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClass.name} is not valid`,
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
        summary: `Find a ${this.entityClass.name} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiOkResponse({ type: this.entityReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClass.name} with the given id was not found`,
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
      ApiOperation({ summary: `Find all ${this.entityClass.name}`, ...extras }),
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
        summary: `Update a ${this.entityClass.name} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiBody({ type: this.updateDto }),
      ApiOkResponse({ type: BlankReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClass.name} with the given id was not found`,
      }),
      ApiBadRequestResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClass.name} is not valid`,
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
        summary: `Delete a ${this.entityClass.name} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiOkResponse({ type: BlankReturnMessageDto }),
      ApiNotFoundResponse({
        type: BlankReturnMessageDto,
        description: `The ${this.entityClass.name} with the given id was not found`,
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
        summary: `Import ${this.entityClass.name}`,
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
