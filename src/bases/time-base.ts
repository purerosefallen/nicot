import {
  CreateDateColumn,
  DeleteDateColumn,
  SelectQueryBuilder,
  UpdateDateColumn,
} from 'typeorm';
import { NotColumn, NotInResult } from '../decorators';
import { PageSettingsDto } from './page-settings';

export interface DeletionWise {
  deleteTime?: Date;
}

export interface EntityHooks {
  isValidInCreate(): string | undefined;
  beforeCreate(): Promise<void>;
  afterCreate(): Promise<void>;
  beforeGet(): Promise<void>;
  afterGet(): Promise<void>;
  isValidInUpdate(): string | undefined;
  beforeUpdate(): Promise<void>;
}

export class TimeBase
  extends PageSettingsDto
  implements DeletionWise, EntityHooks
{
  @CreateDateColumn({ select: false })
  @NotColumn()
  @NotInResult({ entityVersioningDate: true })
  @Reflect.metadata('design:type', Date)
  createTime: Date;

  @UpdateDateColumn({ select: false })
  @NotColumn()
  @NotInResult({ entityVersioningDate: true })
  @Reflect.metadata('design:type', Date)
  updateTime: Date;

  @DeleteDateColumn({ select: false })
  @NotColumn()
  @NotInResult({ entityVersioningDate: true })
  @Reflect.metadata('design:type', Date)
  deleteTime: Date;

  isValidInCreate(): string | undefined {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async beforeCreate(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async afterCreate(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async beforeGet(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async afterGet(): Promise<void> {}

  isValidInUpdate(): string | undefined {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async beforeUpdate(): Promise<void> {}
}
