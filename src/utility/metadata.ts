import { MetadataSetter, Reflector } from 'typed-reflector';
import { QueryCond } from '../bases';

interface SpecificFields {
  notColumn: boolean;
  notWritable: boolean;
  notChangeable: boolean;
  notQueryable: boolean;
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
