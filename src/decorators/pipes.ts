import { ValidationPipe } from '@nestjs/common';

export const CreatePipe = new ValidationPipe({
  transform: true,
  transformOptions: { groups: ['c'], enableImplicitConversion: true },
});

export const GetPipe = new ValidationPipe({
  transform: true,
  transformOptions: { groups: ['r'], enableImplicitConversion: true },
  skipMissingProperties: true,
  skipNullProperties: true,
  skipUndefinedProperties: true,
});

export const UpdatePipe = new ValidationPipe({
  transform: true,
  transformOptions: { groups: ['u'], enableImplicitConversion: true },
  skipMissingProperties: true,
  skipNullProperties: true,
  skipUndefinedProperties: true,
});
