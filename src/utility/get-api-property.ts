import type { ApiPropertyOptions } from '@nestjs/swagger';
import type { AnyClass } from 'nesties';
import { DECORATORS } from './swagger-decorators';

export const getApiProperty = (
  cls: AnyClass,
  key: string,
): ApiPropertyOptions => {
  let proto = cls.prototype;

  while (proto && proto !== Object.prototype) {
    const meta = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      proto,
      key,
    );

    if (meta) return meta;

    proto = Object.getPrototypeOf(proto);
  }

  return {};
};
