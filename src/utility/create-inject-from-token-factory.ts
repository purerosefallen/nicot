import { Inject } from '@nestjs/common';

type InjectToken = Parameters<typeof Inject>[0];

export const createInjectFromTokenFactory =
  <P extends any[]>(factory: (...params: P) => InjectToken) =>
  (...params: P) =>
    Inject(factory(...params));
