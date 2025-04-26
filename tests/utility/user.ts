import { Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import {
  DateColumn,
  EnumColumn,
  IntColumn,
  NotChangeable,
  NotColumn,
  NotInResult,
  NotWritable,
  QueryColumn,
  QueryEqual,
  QueryGreater,
  QueryLess,
  StringColumn,
} from '../../src/decorators';
import { IdBase, StringIdBase } from '../../src/bases';
import { Exclude } from 'class-transformer';

export enum Gender {
  F = 'F',
  M = 'M',
}

export class Page {
  id: number;
  name: string;
  book: Book;
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

  @QueryColumn()
  @QueryGreater('age')
  ageMoreThan: number;

  @QueryColumn()
  @QueryLess('age')
  ageLessThan: number;

  @NotChangeable()
  @EnumColumn(Gender)
  gender: Gender;

  @NotWritable()
  @DateColumn()
  createdAt: Date;

  @NotColumn()
  birthday: Date;

  @OneToMany(() => Book, (book) => book.user)
  books: Book[];
}

@Entity()
export class Book extends IdBase() {
  @IntColumn('bigint', { unsigned: true })
  @QueryEqual()
  userId: number;

  @StringColumn(255)
  name: string;

  @StringColumn(255)
  @NotInResult()
  tag: string;

  @NotColumn()
  @ManyToOne(() => User, (user) => user.books, { onDelete: 'CASCADE' })
  user: User;
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
