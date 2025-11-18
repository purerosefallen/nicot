import { ColumnCommonOptions } from 'typeorm/decorator/options/ColumnCommonOptions';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { ColumnWithLengthOptions } from 'typeorm/decorator/options/ColumnWithLengthOptions';
import { AnyClass, MergePropertyDecorators } from 'nesties';
import { Column, Index } from 'typeorm';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SimpleColumnType,
  WithLengthColumnType,
  WithPrecisionColumnType,
  WithWidthColumnType,
} from 'typeorm/driver/types/ColumnTypes';
import { ColumnWithWidthOptions } from 'typeorm/decorator/options/ColumnWithWidthOptions';
import { ColumnNumericOptions } from 'typeorm/decorator/options/ColumnNumericOptions';
import { Exclude, Transform, Type } from 'class-transformer';
import { BigintTransformer } from '../utility/bigint';
import { Metadata } from '../utility/metadata';
import { ClassOrArray, getClassFromClassOrArray, ParseType } from 'nesties';
import {
  TypeTransformer,
  TypeTransformerString,
} from '../utility/type-transformer';
import { NotInResult, NotQueryable, NotWritable } from './access';
import { parseBool } from '../utility/parse-bool';

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
  options: PropertyOptions<string, ColumnWithLengthOptions> & {
    columnType?: WithLengthColumnType;
  } = {},
): PropertyDecorator => {
  return MergePropertyDecorators([
    Column(options.columnType || 'varchar', {
      length,
      ...columnDecoratorOptions(options),
    }),
    IsString(),
    MaxLength(length),
    validatorDecorator(options),
    swaggerDecorator(options, { type: String, maxLength: length }),
  ]);
};

export const TextColumn = (
  options: PropertyOptions<string> & {
    columnType?: SimpleColumnType;
  } = {},
): PropertyDecorator => {
  return MergePropertyDecorators([
    Column(options.columnType || 'text', columnDecoratorOptions(options)),
    IsString(),
    validatorDecorator(options),
    swaggerDecorator(options, { type: String }),
  ]);
};

export const UuidColumn = (
  options: PropertyOptions<string> & { generated?: boolean } = {},
): PropertyDecorator => {
  return MergePropertyDecorators([
    Column('uuid', {
      ...columnDecoratorOptions(options),
      ...(options.generated
        ? {
            nullable: false,
            generated: 'uuid',
          }
        : {}),
    }),
    IsUUID(),
    validatorDecorator(options),
    swaggerDecorator(options, {
      type: String,
      format: 'uuid',
      example: '550e8400-e29b-41d4-a716-446655440000',
    }),
  ]);
};

const intMaxList = {
  tinyint: 0x7f,
  smallint: 0x7fff,
  mediumint: 0x7fffff,
  int: 0x7fffffff,
  bigint: Number.MAX_SAFE_INTEGER,
};

export const IntColumn = (
  type: WithWidthColumnType,
  options: PropertyOptions<number, ColumnWithWidthOptions> & {
    unsigned?: boolean;
    range?: {
      min?: number;
      max?: number;
    };
  } = {},
): PropertyDecorator => {
  let max = intMaxList[type] || Number.MAX_SAFE_INTEGER;
  if (max !== Number.MAX_SAFE_INTEGER && options.unsigned) {
    max = max * 2 + 1;
  }
  let min = options.unsigned ? 0 : -max - 1;
  if (options.range) {
    if (typeof options.range.min === 'number' && options.range.min > min) {
      min = options.range.min;
    }
    if (typeof options.range.max === 'number' && options.range.max < max) {
      max = options.range.max;
    }
  }
  return MergePropertyDecorators([
    Column(type, {
      default: options.default,
      unsigned: options.unsigned,
      ...(type === 'bigint' ? { transformer: new BigintTransformer() } : {}),
      ...columnDecoratorOptions(options),
    }),
    IsInt(),
    ...(min > Number.MIN_SAFE_INTEGER ? [Min(min)] : []),
    ...(max < Number.MAX_SAFE_INTEGER ? [Max(max)] : []),
    validatorDecorator(options),
    swaggerDecorator(options, {
      type: Number,
      minimum: min > Number.MIN_SAFE_INTEGER ? min : undefined,
      maximum: max < Number.MAX_SAFE_INTEGER ? max : undefined,
    }),
  ]);
};

export const FloatColumn = (
  type: WithPrecisionColumnType,
  options: PropertyOptions<number, ColumnNumericOptions> & {
    unsigned?: boolean;
    range?: {
      min?: number;
      max?: number;
    };
  } = {},
): PropertyDecorator => {
  let min = options.unsigned ? 0 : Number.MIN_SAFE_INTEGER;
  let max = Number.MAX_SAFE_INTEGER;
  if (
    options.columnExtras?.precision != null &&
    options.columnExtras?.scale != null
  ) {
    const precision = options.columnExtras.precision;
    const scale = options.columnExtras.scale;

    const intDigits = precision - scale;

    if (intDigits > 0) {
      const maxIntPart = Math.pow(10, intDigits) - 1;
      const maxDecimalPart =
        scale > 0 ? (Math.pow(10, scale) - 1) / Math.pow(10, scale) : 0;
      max = maxIntPart + maxDecimalPart;
      min = options.unsigned ? 0 : -max;
    }
  }
  return MergePropertyDecorators([
    Column(type, {
      default: options.default,
      unsigned: options.unsigned,
      ...columnDecoratorOptions(options),
    }),
    IsNumber(),
    ...(min > Number.MIN_SAFE_INTEGER ? [Min(min)] : []),
    ...(max < Number.MAX_SAFE_INTEGER ? [Max(max)] : []),
    validatorDecorator(options),
    swaggerDecorator(options, {
      type: Number,
      minimum: min > Number.MIN_SAFE_INTEGER ? min : undefined,
      maximum: max < Number.MAX_SAFE_INTEGER ? max : undefined,
    }),
  ]);
};

export const DateColumn = (
  options: PropertyOptions<Date> & { columnType?: SimpleColumnType } = {},
): PropertyDecorator => {
  return MergePropertyDecorators([
    Column(
      options.columnType || ('timestamp' as SimpleColumnType),
      columnDecoratorOptions(options),
    ),
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
      return parseBool(v.value);
    }),
    Column('boolean', columnDecoratorOptions(options)),
    validatorDecorator(options),
    swaggerDecorator(options, { type: Boolean }),
    Metadata.set('boolColumn', true, 'boolColumnFields'),
  ]);

const createJsonColumnDef =
  (
    columnType: SimpleColumnType = 'jsonb',
    typeTransformerClass = TypeTransformer,
  ) =>
  <C extends ClassOrArray>(
    definition: C,
    options: PropertyOptions<ParseType<C>> & {
      columnType?: SimpleColumnType;
    } = {},
  ): PropertyDecorator => {
    const cl = getClassFromClassOrArray(definition);
    return MergePropertyDecorators([
      NotQueryable(),
      Type(() => cl),
      ValidateNested(),
      Column(options.columnType || columnType, {
        ...columnDecoratorOptions(options),
        transformer: new typeTransformerClass(definition),
      }),
      validatorDecorator(options),
      swaggerDecorator(options, { type: definition }),
    ]);
  };

export const JsonColumn = createJsonColumnDef();
export const SimpleJsonColumn = createJsonColumnDef('json');
export const StringJsonColumn = createJsonColumnDef(
  'text',
  TypeTransformerString,
);

export const NotColumn = (
  options: OpenAPIOptions<any> = {},
  specials: { keepInCreate?: boolean } = {},
): PropertyDecorator =>
  MergePropertyDecorators([
    Exclude(),
    swaggerDecorator({
      required: false,
      ...options,
    }),
    Metadata.set('notColumn', specials, 'notColumnFields'),
  ]);

export const QueryColumn = (
  options: OpenAPIOptions<any> = {},
): PropertyDecorator =>
  MergePropertyDecorators([
    NotWritable(),
    NotInResult(),
    swaggerDecorator({
      required: false,
      ...options,
    }),
  ]);

export const RelationComputed =
  (type?: () => AnyClass): PropertyDecorator =>
  (obj, propertyKey) => {
    const fun = () => {
      const designType = Reflect.getMetadata('design:type', obj, propertyKey);
      const entityClass = type ? type() : designType;
      return {
        entityClass,
        isArray: designType === Array,
      };
    };

    const dec = Metadata.set('relationComputed', fun, 'relationComputedFields');
    return dec(obj, propertyKey);
  };
