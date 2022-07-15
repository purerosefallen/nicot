import { CreateDateColumn, DeleteDateColumn, UpdateDateColumn } from 'typeorm';
import { PageSettingsDto } from '../dto/page-settings';
import { NotColumn } from '../decorators';

export interface DeletionWise {
  deleteTime?: Date;
}

export interface ImportWise {
  isValidInCreation(): string | undefined;
  prepareForSaving(): Promise<void>;
  afterSaving(): void;
}

export class TimeBase
  extends PageSettingsDto
  implements DeletionWise, ImportWise
{
  @CreateDateColumn({ select: false })
  @NotColumn()
  createTime: Date;

  @UpdateDateColumn({ select: false })
  @NotColumn()
  updateTime: Date;

  @DeleteDateColumn({ select: false })
  @NotColumn()
  deleteTime: Date;

  toObject() {
    return JSON.parse(JSON.stringify(this));
  }

  isValidInCreation(): string | undefined {
    return;
  }

  async prepareForSaving(): Promise<void> {}

  afterSaving() {}
}

export const TimeBaseFields: (keyof TimeBase)[] = [
  'createTime',
  'updateTime',
  'deleteTime',
];
