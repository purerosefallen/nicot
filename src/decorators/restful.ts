import { Body, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import {
  BlankReturnMessageDto,
  PaginatedReturnMessageDto,
  ReturnMessageDto,
} from '../dto';
import { MergeMethodDecorators } from './merge';
import { ClassType } from '../utility/insert-field';
import { TimeBase, TimeBaseFields } from '../bases';
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

export interface CrudFactoryOptions<T extends TimeBase> {
  fieldsToOmit?: (keyof T)[];
}

export class RestfulFactory<T extends TimeBase> {
  readonly createDto: ClassType<Omit<T, keyof T>>;
  readonly updateDto: ClassType<Partial<Omit<T, keyof T>>>;
  readonly entityReturnMessageDto = ReturnMessageDto(this.entityClass);
  readonly entityArrayReturnMessageDto = PaginatedReturnMessageDto(
    this.entityClass,
  );
  // eslint-disable-next-line @typescript-eslint/ban-types
  readonly idType: Function;

  constructor(
    public readonly entityClass: ClassType<T>,
    private options: CrudFactoryOptions<T> = {},
  ) {
    this.createDto = OmitType(this.entityClass, [
      ...TimeBaseFields,
      ...(options.fieldsToOmit || []),
    ]);
    this.updateDto = PartialType(this.createDto);
    this.idType = Reflect.getMetadata(
      'design:type',
      this.entityClass.prototype,
      'id',
    );
  }

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
}
