import { MetadataSetter, Reflector } from 'typed-reflector';
import { QueryCond } from '../bases';
import { AnyClass } from 'nesties';
import { QueryFullTextColumnOptions } from './query-full-text-column-options.interface';

interface SpecificFields {
  notColumn: boolean;
  notWritable: boolean;
  notChangeable: boolean;
  notQueryable: boolean;
  notInResult: boolean;
  entityVersioningDate: boolean;
  relationComputed: () => { entityClass: AnyClass; isArray: boolean };
  queryFullTextColumn: QueryFullTextColumnOptions;
}

interface MetadataMap extends SpecificFields {
  queryCondition: QueryCond;
}

type FieldsMap = {
  [K in keyof MetadataMap as `${K}Fields`]: string;
};

type MetadataArrayMap = FieldsMap;

export const Metadata = new MetadataSetter<MetadataMap, MetadataArrayMap>();
export const reflector = new Reflector<MetadataMap, MetadataArrayMap>();

export function getSpecificFields(obj: any, type: keyof SpecificFields) {
  return reflector
    .getArray(`${type}Fields`, obj)
    .filter((field) => reflector.get(type, obj, field));
}

export function getNotInResultFields(
  obj: any,
  keepEntityVersioningDates = false,
) {
  const notInResultFields = getSpecificFields(obj, 'notInResult');
  if (keepEntityVersioningDates) {
    return notInResultFields;
  }
  return [
    ...notInResultFields,
    ...getSpecificFields(obj, 'entityVersioningDate'),
  ];
}
