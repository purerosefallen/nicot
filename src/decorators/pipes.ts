import { PipeTransform, ValidationPipe } from '@nestjs/common';

export const OptionalDataPipe = () =>
  new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    skipMissingProperties: true,
    skipNullProperties: true,
    skipUndefinedProperties: true,
  });

type FieldKey = string | number | symbol;

export const PickPipe = (fields: FieldKey[]): PipeTransform => ({
  transform<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    const proto = Object.getPrototypeOf(obj);
    const clone = Object.create(proto) as T;
    const fieldSet = new Set<FieldKey>(fields);

    for (const key of fieldSet) {
      const desc = Object.getOwnPropertyDescriptor(obj, key);
      if (desc) {
        Object.defineProperty(clone, key, desc);
      }
    }

    return clone;
  },
});

export const OmitPipe = (fields: FieldKey[]): PipeTransform => ({
  transform<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    const proto = Object.getPrototypeOf(obj);
    const clone = Object.create(proto) as T;
    const omitSet = new Set<FieldKey>(fields);

    // 用 Reflect.ownKeys 把 symbol 也一起带上
    for (const key of Reflect.ownKeys(obj)) {
      if (omitSet.has(key)) continue;

      const desc = Object.getOwnPropertyDescriptor(obj, key);
      if (desc) {
        Object.defineProperty(clone, key, desc);
      }
    }

    return clone;
  },
});
