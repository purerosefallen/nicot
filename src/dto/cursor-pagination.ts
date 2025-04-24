import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  AnyClass,
  BlankReturnMessageDto,
  getClassFromClassOrArray,
  InsertField,
} from 'nesties';
import { NotInResult, NotWritable } from '../decorators';

export class CursorPaginationDto {
  @NotWritable()
  @IsNotEmpty()
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Pagination Cursor',
    required: false,
    type: String,
  })
  @NotInResult()
  paginationCursor: string;

  @NotWritable()
  @IsPositive()
  @IsInt()
  @ApiProperty({
    description: 'Records per page.',
    required: false,
    type: Number,
    minimum: 1,
  })
  @NotInResult()
  recordsPerPage: number;
}

export interface CursorPaginationResponseWise {
  nextCursor?: string;
  previousCursor?: string;
}

export class BlankCursorPaginationReturnMessageDto
  extends BlankReturnMessageDto
  implements CursorPaginationResponseWise
{
  @ApiProperty({
    description: 'Next Cursor',
    required: false,
    type: String,
  })
  nextCursor?: string;

  @ApiProperty({
    description: 'Previous Cursor',
    required: false,
    type: String,
  })
  previousCursor?: string;

  constructor(
    statusCode: number,
    message: string,
    cursorResponse: CursorPaginationResponseWise,
  ) {
    super(statusCode, message);
    this.nextCursor = cursorResponse.nextCursor;
    this.previousCursor = cursorResponse.previousCursor;
  }
}

export class GenericCursorPaginationReturnMessageDto<T>
  extends BlankCursorPaginationReturnMessageDto
  implements CursorPaginationResponseWise
{
  data: T[];

  constructor(
    statusCode: number,
    message: string,
    data: T[],
    cursorResponse: CursorPaginationResponseWise,
  ) {
    super(statusCode, message, cursorResponse);
    this.data = data;
  }
}

export function CursorPaginationReturnMessageDto<T extends AnyClass>(
  type: T,
): new (
  statusCode: number,
  message: string,
  data: InstanceType<T>[],
  cursorResponse: CursorPaginationResponseWise,
) => GenericCursorPaginationReturnMessageDto<InstanceType<T>> {
  return InsertField(
    GenericCursorPaginationReturnMessageDto,
    {
      data: {
        type: [type],
        options: {
          required: false,
          description: 'Return data.',
        },
      },
    },
    `${getClassFromClassOrArray(type).name}CursorPaginationReturnMessageDto`,
  );
}
