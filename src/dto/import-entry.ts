import { ApiProperty } from '@nestjs/swagger';
import {
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
