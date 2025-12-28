import { MetadataSetter, Reflector } from 'typed-reflector';
import { QueryCond } from '../bases';
import { AnyClass } from 'nesties';
import { QueryFullTextColumnOptions } from './query-full-text-column-options.interface';
import { GetMutatorOptions } from '../decorators/get-mutator';
import { BindingValueMetadata } from '../decorators/binding';
import _ from 'lodash';

interface SpecificFields {
  notColumn: { keepInCreate?: boolean; hideInUpsert?: boolean };
  notWritable: boolean;
  notCreatable: boolean;
  notChangeable: boolean;
  notUpsertable: boolean;
  notQueryable: boolean;
  notInResult: boolean;
  entityVersioningDate: boolean;
  relationComputed: () => { entityClass: AnyClass; isArray: boolean };
  queryFullTextColumn: QueryFullTextColumnOptions;
  // boolColumn: boolean;
  notRequiredButHasDefault: boolean;
  queryCondition: QueryCond;
  requireGetMutator: boolean;
  getMutator: GetMutatorOptions;
  bindingColumn: string;
  bindingValue: BindingValueMetadata;
  upsertColumn: boolean;
}

interface MetadataMap extends SpecificFields {
  upsertableEntity: boolean;
}

type FieldsMap = {
  [K in keyof MetadataMap as `${K}Fields`]: string;
};

type MetadataArrayMap = FieldsMap;

export const Metadata = new MetadataSetter<MetadataMap, MetadataArrayMap>();
export const reflector = new Reflector<MetadataMap, MetadataArrayMap>();

export function getSpecificFields<K extends keyof SpecificFields>(
  obj: any,
  type: K,
  filter: (meta: SpecificFields[K], obj: any) => boolean = () => true,
) {
  return reflector.getArray(`${type}Fields`, obj).filter((field) => {
    const value = reflector.get(type, obj, field);
    if (value == null) {
      return false;
    }
    return filter(value, obj);
  });
}

export function getNotInResultFields(
  obj: any,
  keepEntityVersioningDates = false,
) {
  const res = getSpecificFields(obj, 'notInResult');
  if (keepEntityVersioningDates) {
    return _.difference(res, getSpecificFields(obj, 'entityVersioningDate'));
  }
  return res;
}
