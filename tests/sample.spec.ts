import { Index } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { EnumColumn, IntColumn, StringColumn } from '../src/decorators';
import { IdBase } from '../src/bases';
import { validate } from 'class-validator';

enum Gender {
  F = 'F',
  M = 'M',
}

class User extends IdBase() {
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

describe('nicot', () => {
  it('create entity class', () => {
    const good1 = plainToInstance(User, { name: 'John', age: 20 });
    const good2 = plainToInstance(User, {
      name: 'John',
      age: 20,
      gender: Gender.M,
    });
    const bad1 = plainToInstance(User, { name: 'John111', age: 20 });
    const bad2 = plainToInstance(User, { age: 20 });
    const bad3 = plainToInstance(User, { name: 'John', age: -1 });
    const bad4 = plainToInstance(User, {
      name: 'John',
      age: 20,
      gender: 'foo',
    });
    expect(validate(good1)).resolves.toEqual([]);
    expect(validate(good2)).resolves.toEqual([]);
    expect(validate(bad1)).resolves.not.toEqual([]);
    expect(validate(bad2)).resolves.not.toEqual([]);
    expect(validate(bad3)).resolves.not.toEqual([]);
    expect(validate(bad4)).resolves.not.toEqual([]);
  });
});
