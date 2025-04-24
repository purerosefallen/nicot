import { Entity, Index } from 'typeorm';
import {
  DateColumn,
  EnumColumn,
  IntColumn,
  NotChangeable,
  NotColumn,
  NotWritable,
  QueryEqual,
  StringColumn,
} from '../../src/decorators';
import { IdBase, StringIdBase } from '../../src/bases';

export enum Gender {
  F = 'F',
  M = 'M',
}

export class Page {
  id: number;
  name: string;
  book: Book;
}

export class Book {
  id: number;
  name: string;
  user: User;
  pages: Page[];
}

@Entity()
export class User extends IdBase() {
  @Index()
  @StringColumn(5, {
    required: true,
  })
  @QueryEqual()
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

  books: Book[];
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
