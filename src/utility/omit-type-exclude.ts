import { OmitType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ClassType } from 'nesties';

export const OmitTypeExclude = <T, K extends keyof T>(
  cl: ClassType<T>,
  keys: readonly K[],
) => {
  const omitted = OmitType(cl, keys);
  for (const key of keys) {
    Exclude()(omitted.prototype, key as any);
  }
  return omitted;
};
