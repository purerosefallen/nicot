import { OmitType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
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

export const PickTypeExpose = <T, K extends keyof T>(
  cl: ClassType<T>,
  keys: readonly K[],
) => {
  const picked = OmitType(
    cl,
    Object.keys(cl.prototype).filter((k) => !keys.includes(k as K)) as K[],
  );
  for (const key of keys) {
    Expose()(picked.prototype, key as any);
  }
  return picked;
};
