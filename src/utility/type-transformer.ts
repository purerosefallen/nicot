import { ValueTransformer } from 'typeorm';
import { ClassOrArray } from 'nesties';
import { nonTransformableTypes } from './non-transformable-types';

const toValue = (cl: new () => any, value: any) => {
  if (cl === Date) {
    return new Date(value);
  }
  if (nonTransformableTypes.has(cl) || value instanceof cl) {
    return value;
  }
  if (typeof value === 'object') {
    return Object.assign(new cl(), value);
  }
  return value;
};

export class TypeTransformer implements ValueTransformer {
  constructor(private definition: ClassOrArray) {}

  from(dbValue) {
    if (!dbValue) {
      return dbValue;
    }
    if (Array.isArray(this.definition)) {
      return dbValue.map((value) => toValue(this.definition[0], value));
    }
    return toValue(this.definition as new () => any, dbValue);
  }
  to(entValue): any {
    return entValue;
  }
}

export class TypeTransformerString extends TypeTransformer {
  from(dbValue) {
    if (dbValue == null) {
      return dbValue;
    }
    return super.from(JSON.parse(dbValue));
  }

  to(entValue): any {
    if (entValue == null) {
      return entValue;
    }
    return JSON.stringify(super.to(entValue));
  }
}
