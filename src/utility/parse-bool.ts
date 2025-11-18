import { PipeTransform } from '@nestjs/common';

export const parseBool = (value: any): boolean => {
  const trueValues = ['true', '1', 'yes', 'on', true, 1];
  const falseValues = ['false', '0', 'no', 'off', false, 0];
  if (trueValues.indexOf(value) !== -1) return true;
  if (falseValues.indexOf(value) !== -1) return false;
  if (!!value) {
    return true;
  }
  return undefined;
};

export const parseBoolObject = <T>(obj: T, boolFields: (keyof T)[]): T => {
  const newObj = { ...obj };
  for (const field of boolFields) {
    newObj[field] = parseBool(newObj[field]) as any;
  }
  return newObj;
};

export class ParseBoolObjectPipe<T> implements PipeTransform {
  constructor(private readonly boolFields: string[]) {}

  transform(obj: T): T {
    return parseBoolObject(obj, this.boolFields as (keyof T)[]);
  }
}
