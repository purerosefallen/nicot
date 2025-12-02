import { ApiPropertyOptions } from '@nestjs/swagger';
import { Metadata } from '../utility/metadata';
import { parseBool } from '../utility/parse-bool';

export interface GetMutatorOptions {
  mutator: (s: string) => any;
  enum?: string[];
  example?: string;
  apiPropertyExtras?: ApiPropertyOptions;
}

export const RequireGetMutator = () =>
  Metadata.set('requireGetMutator', true, 'requireGetMutatorFields');

export const GetMutator = (
  mutator: (s: string) => any,
  options: Omit<GetMutatorOptions, 'mutator'> = {},
) => Metadata.set('getMutator', { mutator, ...options }, 'getMutatorFields');

export const createGetMutator =
  (
    mutator: (s: string) => any,
    defaultOptions: Omit<GetMutatorOptions, 'mutator'> = {},
  ) =>
  (options: Omit<GetMutatorOptions, 'mutator'> = {}) =>
    GetMutator(mutator, {
      ...defaultOptions,
      ...options,
      apiPropertyExtras: {
        ...(defaultOptions.apiPropertyExtras || {}),
        ...(options.apiPropertyExtras || {}),
      } as ApiPropertyOptions,
    });

export const GetMutatorBool = createGetMutator(parseBool, {
  enum: ['0', '1'],
  example: '1',
});

export const GetMutatorInt = createGetMutator((s: string) => parseInt(s, 10));

export const GetMutatorFloat = createGetMutator((s: string) => parseFloat(s));

export const GetMutatorStringSeparated = (
  separator = ',',
  options: Omit<GetMutatorOptions, 'mutator'> = {},
) =>
  GetMutator((s: string) => s.split(separator), {
    example: `value1${separator}value2${separator}value3`,
    ...options,
  });

export const GetMutatorIntSeparated = (
  separator = ',',
  options: Omit<GetMutatorOptions, 'mutator'> = {},
) =>
  GetMutator(
    (s: string) => s.split(separator).map((item) => parseInt(item.trim(), 10)),
    {
      example: `1${separator}2${separator}3`,
      ...options,
    },
  );

export const GetMutatorFloatSeparated = (
  separator = ',',
  options: Omit<GetMutatorOptions, 'mutator'> = {},
) =>
  GetMutator(
    (s: string) => s.split(separator).map((item) => parseFloat(item.trim())),
    {
      example: `1.5${separator}2.5${separator}3.5`,
      ...options,
    },
  );

export const GetMutatorJson = createGetMutator((s: string) => JSON.parse(s), {
  example: `{"key1":"value1","key2":2,"key3":[1,2,3]}`,
});
