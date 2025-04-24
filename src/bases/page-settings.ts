import { NotInResult, NotWritable } from '../decorators';
import { SelectQueryBuilder } from 'typeorm';
import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { reflector } from '../utility/metadata';
import { PageSettingsWise } from 'nesties';

export interface PageSettingsFactory {
  getActualPageSettings(): PageSettingsWise;
}

export interface QueryWise<T> {
  applyQuery(qb: SelectQueryBuilder<T>, entityName: string): void;
}

export type QueryCond = <T>(
  obj: T,
  qb: SelectQueryBuilder<T>,
  entityName: string,
  key: keyof T & string,
) => any;

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
  @NotInResult()
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
  @NotInResult()
  recordsPerPage: number;

  getActualPageSettings(): PageSettingsWise {
    return {
      pageCount: this.getPageCount(),
      recordsPerPage: this.getRecordsPerPage(),
    };
  }

  getPageCount() {
    return parseInt(this.pageCount as any) || 1;
  }

  getRecordsPerPage() {
    return parseInt(this.recordsPerPage as any) || 25;
  }

  getStartingFrom() {
    return (this.getPageCount() - 1) * this.getRecordsPerPage();
  }

  applyPaginationQuery(qb: SelectQueryBuilder<any>): void {
    qb.take(this.getRecordsPerPage()).skip(this.getStartingFrom());
  }

  applyQuery(qb: SelectQueryBuilder<any>, entityName: string) {}
}
