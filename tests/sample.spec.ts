import { Index } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { EnumColumn, IntColumn, StringColumn, IdBase, StringIdBase } from '..';
import { validateSync } from 'class-validator';

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

class User2 extends StringIdBase({ length: 20 }) {
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
  it('creates entity class', () => {
    expect(
      validateSync(plainToInstance(User, { name: 'John', age: 20 })),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(User, { name: 'John', age: 20, gender: Gender.M }),
      ),
    ).toEqual([]);

    expect(
      validateSync(plainToInstance(User, { name: 'John111', age: 20 })),
    ).not.toEqual([]);
    expect(validateSync(plainToInstance(User, { age: 20 }))).not.toEqual([]);
    expect(
      validateSync(plainToInstance(User, { name: 'John', age: -1 })),
    ).not.toEqual([]);
    expect(
      validateSync(
        plainToInstance(User, { name: 'John', age: 20, gender: 'foo' }),
      ),
    ).not.toEqual([]);
  });
  it('creates entity class with string id', () => {
    const user2 = plainToInstance(User2, {
      name: 'John',
      age: 20,
      gender: Gender.M,
    });
    user2.id = 'join111';
    expect(validateSync(user2)).toEqual([]);
    expect(
      validateSync(
        plainToInstance(User2, { name: 'John', age: 20, gender: Gender.M }),
      ),
    ).not.toEqual([]);
  });
});
