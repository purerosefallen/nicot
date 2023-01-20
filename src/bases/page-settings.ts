import { NotWritable } from '../decorators';
import { SelectQueryBuilder } from 'typeorm';
import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { reflector } from '../utility/metadata';

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

export type QueryCond = <T extends PageSettingsDto>(
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
    const queryFields = reflector.getArray('queryConditionFields', this);
    for (const field of queryFields) {
      const condition = reflector.get('queryCondition', this, field);
      if (condition) {
        condition(this, qb, entityName, field as keyof PageSettingsDto);
      }
    }
    qb.take(this.getRecordsPerPage()).skip(this.getStartingFrom());
  }
}
