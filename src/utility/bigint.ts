import { ValueTransformer } from 'typeorm';

export class BigintTransformer implements ValueTransformer {
  from(dbValue) {
    if (dbValue == null) {
      return dbValue;
    }
    return parseInt(dbValue);
  }
  to(entValue): any {
    return entValue;
  }
}
