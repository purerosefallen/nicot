import { CreateDateColumn, DeleteDateColumn, UpdateDateColumn } from 'typeorm';
import { NotColumn } from '../decorators';
import { PageSettingsDto } from './page-settings';

export interface DeletionWise {
  deleteTime?: Date;
}

export interface ImportWise {
  isValidInCreation(): string | undefined;
  beforeSaving(): Promise<void>;
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

  isValidInCreation(): string | undefined {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async beforeSaving(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async afterSaving(): Promise<void> {}
}

export const TimeBaseFields: (keyof TimeBase)[] = [
  'createTime',
  'updateTime',
  'deleteTime',
];
