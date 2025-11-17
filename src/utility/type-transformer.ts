import { ValueTransformer } from 'typeorm';
import { ClassOrArray } from 'nesties';

const nonTransformableTypes = new Set<new () => any>([String, Number, Boolean]);

const toValue = (cl: new () => any, value: any) => {
  if (nonTransformableTypes.has(cl)) {
    return value;
  }
  if (cl === Date) {
    return new Date(value);
  }
  return Object.assign(new cl(), value);
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
