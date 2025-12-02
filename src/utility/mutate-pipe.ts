import { getSpecificFields, reflector } from './metadata';
import { PipeTransform } from '@nestjs/common';
import { AnyClass } from 'nesties';

export class MutatorPipe implements PipeTransform {
  constructor(private readonly entityClass: AnyClass) {}

  private mutatorFields = getSpecificFields(this.entityClass, 'getMutator');

  transform<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    const newObj = { ...obj } as any;
    for (const field of this.mutatorFields) {
      const v = newObj[field];
      if (v == null) {
        continue;
      }
      const mutator = reflector.get('getMutator', this.entityClass, field);
      newObj[field] = mutator.mutator(v);
    }
    return newObj;
  }
}
