import { MetadataSetter, Reflector } from 'typed-reflector';
import { QueryCond } from '../bases';
import { AnyClass } from 'nesties';
import { QueryFullTextColumnOptions } from './query-full-text-column-options.interface';

interface SpecificFields {
  notColumn: { keepInCreate?: boolean };
  notWritable: boolean;
  notCreatable: boolean;
  notChangeable: boolean;
  notQueryable: boolean;
  notInResult: { entityVersioningDate?: boolean };
  relationComputed: () => { entityClass: AnyClass; isArray: boolean };
  queryFullTextColumn: QueryFullTextColumnOptions;
  boolColumn: boolean;
  notRequiredButHasDefault: boolean;
  queryCondition: QueryCond;
}

type MetadataMap = SpecificFields;

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
  return getSpecificFields(
    obj,
    'notInResult',
    (meta) => !keepEntityVersioningDates || !meta.entityVersioningDate,
  );
}
