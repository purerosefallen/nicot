import { ValueTransformer } from 'typeorm';
import { ClassOrArray } from 'nesties';

export class TypeTransformer implements ValueTransformer {
  constructor(private definition: ClassOrArray) {}

  from(dbValue) {
    if (!dbValue) {
      return dbValue;
    }
    if (Array.isArray(this.definition)) {
      return dbValue.map((value) =>
        Object.assign(new this.definition[0](), value),
      );
    }
    return Object.assign(new this.definition(), dbValue);
  }
  to(entValue): any {
    return entValue;
  }
}
