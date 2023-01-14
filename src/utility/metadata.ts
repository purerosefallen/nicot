import { MetadataSetter, Reflector } from 'typed-reflector';

export interface SpecificFields {
  notColumn: boolean;
  notWritable: boolean;
  notChangeable: boolean;
}
type MetadataArrayMap = { [K in keyof SpecificFields as `${K}Fields`]: string };

export const Metadata = new MetadataSetter<SpecificFields, MetadataArrayMap>();
export const reflector = new Reflector<SpecificFields, MetadataArrayMap>();

export function getSpecificFields(obj: any, type: keyof SpecificFields) {
  return reflector
    .getArray(`${type}Fields`, obj)
    .filter((field) => reflector.get(type, obj, field));
}
