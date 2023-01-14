import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RestfulFactory } from '../src/decorators';
import { getSpecificFields } from '../src/utility/metadata';
import { Gender, User, User2 } from './utility/user';

describe('entity', () => {
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
        plainToInstance(User, { name: 123123, age: 20, gender: Gender.M }),
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
        plainToInstance(User2, {
          name: 'John',
          age: 20,
          gender: Gender.M,
          createdAt: new Date(),
        }),
      ),
    ).not.toEqual([]);
  });

  it('should set omit fields', () => {
    const factory = new RestfulFactory(User);
    expect(factory.fieldsToOmit.includes('createTime')).toBe(true);
    expect(getSpecificFields(User, 'notWritable').includes('createdAt')).toBe(
      true,
    );
    expect(getSpecificFields(User, 'notChangeable').includes('gender')).toBe(
      true,
    );
  });
});
