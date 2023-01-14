import { Entity, Index } from 'typeorm';
import { DateColumn, EnumColumn, IntColumn, NotChangeable, NotColumn, NotWritable, StringColumn } from '../../src/decorators';
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

  @NotChangeable()
  @EnumColumn(Gender)
  gender: Gender;

  @NotWritable()
  @DateColumn()
  createdAt: Date;

  @NotColumn()
  birthday: Date;
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

  @NotChangeable()
  @EnumColumn(Gender)
  gender: Gender;

  @NotWritable()
  @DateColumn()
  createdAt: Date;

  @NotColumn()
  birthday: Date;
}
