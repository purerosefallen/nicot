import { Entity, Index } from 'typeorm';
import { EnumColumn, IntColumn, StringColumn } from '../../src/decorators';
import { IdBase, StringIdBase } from '../../src/bases';

export enum Gender {
  F = 'F',
  M = 'M',
}

@Entity()
export class User extends IdBase() {
  @Index()
  @StringColumn(5, {
    required: true,
  })
  name: string;

  @IntColumn('int', { unsigned: true })
  age: number;

  @EnumColumn(Gender)
  gender: Gender;
}

@Entity()
export class User2 extends StringIdBase({ length: 20 }) {
  @Index()
  @StringColumn(5, {
    required: true,
  })
  name: string;

  @IntColumn('int', { unsigned: true })
  age: number;

  @EnumColumn(Gender)
  gender: Gender;
}
