import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import {
  AnyClass,
  ClassOrArray,
  getClassFromClassOrArray,
  InsertField,
} from '../utility/insert-field';

export class ImportEntryBaseDto {
  @ApiProperty({ description: 'Import result', type: String })
  result: string;
}

export interface ImportEntry<T> {
  entry: T;
  result: string;
}

export function ImportEntryDto<C extends ClassOrArray>(type: C) {
  return InsertField(
    ImportEntryBaseDto,
    {
      entry: { type, options: { description: 'Import entry' } },
    },
    `${getClassFromClassOrArray(type).name}ImportEntry`,
  );
}

export class ImportDataBaseDto<T> {
  @ValidateNested()
  data: T[];
}

export function ImportDataDto<C extends AnyClass>(type: C) {
  const dtoClass = InsertField(
    ImportDataBaseDto,
    {
      entry: { type: [type], options: { description: 'Import data' } },
    },
    `${getClassFromClassOrArray(type).name}ImportData`,
  );
  Type(() => dtoClass)(dtoClass.prototype, 'data');
  return dtoClass;
}
