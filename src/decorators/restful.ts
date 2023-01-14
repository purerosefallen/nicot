import {
  Body,
  Delete,
  Get,
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
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
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

export interface RestfulFactoryOptions<T> {
  fieldsToOmit?: (keyof T)[];
}

export class RestfulFactory<T> {
  readonly entityReturnMessageDto = ReturnMessageDto(this.entityClass);
  readonly entityArrayReturnMessageDto = PaginatedReturnMessageDto(
    this.entityClass,
  );
  readonly importReturnMessageDto = ReturnMessageDto(
    ImportEntryDto(this.entityClass),
  );
  readonly fieldsToOmit = _.uniq([
    ...(getSpecificFields(this.entityClass, 'notColumn') as (keyof T)[]),
    ...(this.options.fieldsToOmit || []),
  ]);
  private readonly basicDto = OmitType(
    this.entityClass,
    this.fieldsToOmit,
  ) as ClassType<T>;
  readonly createDto = OmitType(
    this.entityClass,
    getSpecificFields(this.entityClass, 'notWritable') as (keyof T)[],
  ) as ClassType<T>;
  readonly importDto = ImportDataDto(this.createDto);
  readonly findAllDto = PartialType(this.basicDto) as ClassType<T>;
  readonly updateDto = PartialType(
    OmitType(
      this.createDto,
      getSpecificFields(this.entityClass, 'notChangeable') as (keyof T)[],
    ),
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

  create(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      Post(),
      ApiOperation({
        summary: `Create a new ${this.entityClass.name}`,
        ...extras,
      }),
      ApiBody({ type: this.createDto }),
      ApiCreatedResponse({ type: this.entityReturnMessageDto }),
    ]);
  }

  createParam() {
    return Body(CreatePipe);
  }

  findOne(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      Get(':id'),
      ApiOperation({
        summary: `Find a ${this.entityClass.name} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiOkResponse({ type: this.entityReturnMessageDto }),
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
      Get(),
      ApiOperation({ summary: `Find all ${this.entityClass.name}`, ...extras }),
      ApiOkResponse({ type: this.entityArrayReturnMessageDto }),
    ]);
  }

  findAllParam() {
    return Query(GetPipe);
  }

  update(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      Patch(':id'),
      ApiOperation({
        summary: `Update a ${this.entityClass.name} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiBody({ type: this.updateDto }),
      ApiOkResponse({ type: BlankReturnMessageDto }),
    ]);
  }

  updateParam() {
    return Body(UpdatePipe);
  }

  delete(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      Delete(':id'),
      ApiOperation({
        summary: `Delete a ${this.entityClass.name} by id`,
        ...extras,
      }),
      ApiParam({ name: 'id', type: this.idType, required: true }),
      ApiNoContentResponse({ type: BlankReturnMessageDto }),
    ]);
  }

  import(extras: Partial<OperationObject> = {}): MethodDecorator {
    return MergeMethodDecorators([
      Post('import'),
      ApiOperation({
        summary: `Import ${this.entityClass.name}`,
        ...extras,
      }),
      ApiBody({ type: this.importDto }),
      ApiCreatedResponse({ type: this.importReturnMessageDto }),
    ]);
  }
}
