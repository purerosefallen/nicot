import { TimeBase } from './time-base';
import { Generated, SelectQueryBuilder } from 'typeorm';
import { applyQueryProperty } from '../utility';
import {
  IntColumn,
  NotChangeable,
  NotWritable,
  StringColumn,
} from '../decorators';
import { IsNotEmpty, IsString } from 'class-validator';
import { MergePropertyDecorators } from 'nesties';

export interface IdOptions {
  description?: string;
}

export function IdBase(idOptions: IdOptions = {}) {
  const cl = class IdBase extends TimeBase {
    id: number;
    override applyQuery(qb: SelectQueryBuilder<IdBase>, entityName: string) {
      super.applyQuery(qb, entityName);
      qb.orderBy(`${entityName}.id`, 'DESC');
      applyQueryProperty(this, qb, entityName, 'id');
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
      qb.orderBy(`${entityName}.id`, 'ASC');
      applyQueryProperty(this, qb, entityName, 'id');
    }
  };
  const decs = [
    StringColumn(idOptions.length || (idOptions.uuid ? 36 : 255), {
      required: !idOptions.uuid,
      description: idOptions.description,
      columnExtras: { primary: true, nullable: false },
    }),
    Reflect.metadata('design:type', String),
    ...(idOptions.uuid ? [
      Generated('uuid'),
      NotWritable(),
    ] : [
      IsString(),
      IsNotEmpty(),
      NotChangeable(),
    ])
  ];
  const dec = MergePropertyDecorators(decs);
  dec(cl.prototype, 'id');
  return cl;
}
