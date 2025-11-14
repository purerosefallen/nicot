import { TimeBase } from './time-base';
import { Generated, SelectQueryBuilder } from 'typeorm';
import {
  IntColumn,
  NotChangeable,
  NotWritable,
  PropertyOptions,
  QueryEqual,
  StringColumn,
  UuidColumn,
} from '../decorators';
import { IsNotEmpty } from 'class-validator';
import { MergePropertyDecorators } from 'nesties';

export interface IdOptions {
  description?: string;
  noOrderById?: boolean;
}

export function IdBase(idOptions: IdOptions = {}) {
  const cl = class IdBase extends TimeBase {
    id: number;
    override applyQuery(qb: SelectQueryBuilder<IdBase>, entityName: string) {
      super.applyQuery(qb, entityName);
      if (!idOptions.noOrderById) {
        qb.orderBy(`${entityName}.id`, 'DESC');
      }
    }
  };
  const dec = MergePropertyDecorators([
    NotWritable(),
    IntColumn('bigint', {
      unsigned: true,
      description: idOptions.description,
      columnExtras: { nullable: false, primary: true },
    }),
    Reflect.metadata('design:type', Number),
    Generated('increment'),
    QueryEqual(),
  ]);
  dec(cl.prototype, 'id');
  return cl;
}

export interface StringIdOptions extends IdOptions {
  length?: number;
  uuid?: boolean;
}

export function StringIdBase(idOptions: StringIdOptions) {
  const cl = class StringIdBase extends TimeBase {
    id: string;

    override applyQuery(
      qb: SelectQueryBuilder<StringIdBase>,
      entityName: string,
    ) {
      super.applyQuery(qb, entityName);
      if (!idOptions.noOrderById) {
        qb.orderBy(`${entityName}.id`, 'ASC');
      }
    }
  };
  const columnOptions: PropertyOptions<string> = {
    required: !idOptions.uuid,
    description: idOptions.description,
    columnExtras: { primary: true, nullable: false },
  };
  const decs = [
    Reflect.metadata('design:type', String),
    QueryEqual(),
    ...(idOptions.uuid
      ? [
          UuidColumn({ ...columnOptions, generated: true }),
          Generated('uuid'),
          NotWritable(),
        ]
      : [
          StringColumn(idOptions.length || 255, columnOptions),
          IsNotEmpty(),
          NotChangeable(),
        ]),
  ];
  const dec = MergePropertyDecorators(decs);
  dec(cl.prototype, 'id');
  return cl;
}
