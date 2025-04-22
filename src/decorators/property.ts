import { ColumnCommonOptions } from 'typeorm/decorator/options/ColumnCommonOptions';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { ColumnWithLengthOptions } from 'typeorm/decorator/options/ColumnWithLengthOptions';
import { MergePropertyDecorators } from 'nesties';
import { Column, Index } from 'typeorm';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  WithPrecisionColumnType,
  WithWidthColumnType,
} from 'typeorm/driver/types/ColumnTypes';
import { ColumnWithWidthOptions } from 'typeorm/decorator/options/ColumnWithWidthOptions';
import { ColumnNumericOptions } from 'typeorm/decorator/options/ColumnNumericOptions';
import { Exclude, Transform, Type } from 'class-transformer';
import { BigintTransformer } from '../utility/bigint';
import { Metadata } from '../utility/metadata';
import { ClassOrArray, getClassFromClassOrArray, ParseType } from 'nesties';
import { TypeTransformer } from '../utility/type-transformer';
import { NotQueryable } from './access';

export interface OpenAPIOptions<T> {
  description?: string;
  propertyExtras?: ApiPropertyOptions;
  default?: T;
  required?: boolean;
}

function swaggerDecorator(
  options: OpenAPIOptions<any>,
  injected: ApiPropertyOptions = {},
) {
  return ApiProperty({
    default: options.default,
    required: !!(options.required && options.default == null),
    example: options.default,
    description: options.description,
    ...injected,
    ...(options.propertyExtras || {}),
  } as ApiPropertyOptions);
}

function validatorDecorator(options: OpenAPIOptions<any>) {
  const decs: PropertyDecorator[] = [];
  if (!options.required) {
    decs.push(IsOptional());
  }
  return MergePropertyDecorators(decs);
}

export interface PropertyOptions<T, ColumnEx = unknown>
  extends OpenAPIOptions<T> {
  columnExtras?: ColumnCommonOptions & ColumnEx;
}

function columnDecoratorOptions<T>(
  options: PropertyOptions<T>,
): ColumnCommonOptions {
  return {
    default: options.default,
    nullable: !options.required && options.default == null,
    comment: options.description,
    ...options.columnExtras,
  };
}

export const StringColumn = (
  length: number,
  options: PropertyOptions<string, ColumnWithLengthOptions> = {},
): PropertyDecorator => {
  return MergePropertyDecorators([
    Column('varchar', { length, ...columnDecoratorOptions(options) }),
    IsString(),
    MaxLength(length),
    validatorDecorator(options),
    swaggerDecorator(options, { type: String, maxLength: length }),
  ]);
};

export const IntColumn = (
  type: WithWidthColumnType,
  options: PropertyOptions<number, ColumnWithWidthOptions> & {
    unsigned?: boolean;
  } = {},
): PropertyDecorator => {
  const decs = [
    Column(type, {
      default: options.default,
      unsigned: options.unsigned,
      ...(type === 'bigint' ? { transformer: new BigintTransformer() } : {}),
      ...columnDecoratorOptions(options),
    }),
    IsInt(),
    validatorDecorator(options),
    swaggerDecorator(options, {
      type: Number,
      minimum: options.unsigned ? 0 : undefined,
    }),
  ];
  if (options.unsigned) {
    decs.push(Min(0));
  }
  return MergePropertyDecorators(decs);
};

export const FloatColumn = (
  type: WithPrecisionColumnType,
  options: PropertyOptions<number, ColumnNumericOptions> & {
    unsigned?: boolean;
  } = {},
): PropertyDecorator => {
  const decs = [
    Column(type, {
      default: options.default,
      unsigned: options.unsigned,
      ...columnDecoratorOptions(options),
    }),
    IsNumber(),
    validatorDecorator(options),
    swaggerDecorator(options, {
      type: Number,
      minimum: options.unsigned ? 0 : undefined,
    }),
  ];
  if (options.unsigned) {
    decs.push(Min(0));
  }
  return MergePropertyDecorators(decs);
};

export const DateColumn = (
  options: PropertyOptions<Date> = {},
): PropertyDecorator => {
  return MergePropertyDecorators([
    Column('timestamp', columnDecoratorOptions(options)),
    IsDate(),
    Transform(
      (v) => {
        const value = v.value;
        if (value == null || value instanceof Date) return value;
    
        const timestampToDate = (t: number, isSeconds: boolean) =>
          new Date(isSeconds ? t * 1000 : t);
    
        if (typeof value === 'number') {
          const isSeconds = !Number.isInteger(value) || value < 1e12;
          return timestampToDate(value, isSeconds);
        }
    
        if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
          const isSeconds = value.includes('.') || parseFloat(value) < 1e12;
          return timestampToDate(parseFloat(value), isSeconds);
        }
    
        return new Date(value); // fallback to native parser
      },
      {
        toClassOnly: true,
      },
    ),
    validatorDecorator(options),
    swaggerDecorator(options, { type: Date }),
  ]);
};

export const EnumColumn = <T>(
  targetEnum: Record<string, T>,
  options: PropertyOptions<T> = {},
): PropertyDecorator => {
  return MergePropertyDecorators([
    Index(),
    Column('enum', {
      enum: targetEnum,
      ...columnDecoratorOptions(options),
    }),
    IsEnum(targetEnum),
    validatorDecorator(options),
    swaggerDecorator(options, { enum: targetEnum }),
  ]);
};

export const BoolColumn = (
  options: PropertyOptions<boolean> = {},
): PropertyDecorator =>
  MergePropertyDecorators([
    Index(),
    Transform((v) => {
      const trueValues = ['true', '1', 'yes', 'on', true, 1];
      const falseValues = ['false', '0', 'no', 'off', false, 0];
      if (trueValues.indexOf(v.value) !== -1) return true;
      if (falseValues.indexOf(v.value) !== -1) return false;
      return undefined;
    }),
    Column('boolean', columnDecoratorOptions(options)),
    validatorDecorator(options),
    swaggerDecorator(options, { type: Boolean }),
  ]);

export const JsonColumn = <C extends ClassOrArray>(
  definition: C,
  options: PropertyOptions<ParseType<C>> = {},
): PropertyDecorator => {
  const cl = getClassFromClassOrArray(definition);
  return MergePropertyDecorators([
    NotQueryable(),
    Type(() => cl),
    ValidateNested(),
    Column('jsonb', {
      ...columnDecoratorOptions(options),
      transformer: new TypeTransformer(definition),
    }),
    validatorDecorator(options),
    swaggerDecorator(options, { type: definition }),
  ]);
};

export const NotColumn = (
  options: OpenAPIOptions<any> = {},
): PropertyDecorator =>
  MergePropertyDecorators([
    Exclude(),
    swaggerDecorator({
      required: false,
      ...options,
    }),
    Metadata.set('notColumn', true, 'notColumnFields'),
  ]);
