import { MetadataSetter, Reflector } from "typed-reflector";

export interface MetadataArrayMap {
  notColumnFields: string;
}

export interface MetadataMap {
  notColumn: boolean;
}

export const Metadata = new MetadataSetter<MetadataMap, MetadataArrayMap>();
export const reflector = new Reflector<MetadataMap, MetadataArrayMap>();
