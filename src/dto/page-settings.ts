import { NotWritable } from '../decorators';
import { SelectQueryBuilder } from 'typeorm';
import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export interface PageSettingsWise {
  pageCount: number;
  recordsPerPage: number;
}

export interface PageSettingsFactory {
  getActualPageSettings(): PageSettingsWise;
}

export interface QueryWise<T> {
  applyQuery(qb: SelectQueryBuilder<T>, entityName: string): void;
}

export class PageSettingsDto
  implements PageSettingsWise, PageSettingsFactory, QueryWise<PageSettingsDto>
{
  @NotWritable()
  @IsPositive()
  @IsInt()
  @ApiProperty({
    description: 'The nth page, starting with 1.',
    required: false,
    type: Number,
    minimum: 1,
  })
  pageCount: number;

  @NotWritable()
  @IsPositive()
  @IsInt()
  @ApiProperty({
    description: 'Records per page.',
    required: false,
    type: Number,
    minimum: 1,
  })
  recordsPerPage: number;

  getActualPageSettings(): PageSettingsWise {
    return {
      pageCount: this.getPageCount(),
      recordsPerPage: this.getRecordsPerPage(),
    };
  }

  getPageCount() {
    return this.pageCount || 1;
  }

  getRecordsPerPage() {
    return this.recordsPerPage || 25;
  }

  getStartingFrom() {
    return (this.getPageCount() - 1) * this.getRecordsPerPage();
  }

  applyQuery(qb: SelectQueryBuilder<PageSettingsDto>, entityName: string) {
    qb.take(this.getRecordsPerPage()).skip(this.getStartingFrom());
  }
}
