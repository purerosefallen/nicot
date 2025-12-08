// observe-diff.spec.ts

import { observeDiff } from '../src/utility/observe-diff';

interface TestObj {
  foo?: number | null;
  bar?: string | null;
}

type Change<T> = Parameters<typeof observeDiff<T>>[1] extends (
  change: infer C,
) => any
  ? C
  : never;

describe('observeDiff', () => {
  it('should emit update when existing key is changed', () => {
    const obj: TestObj = { foo: 1, bar: 'x' };

    const changes: Change<TestObj>[] = [];
    const proxy = observeDiff(obj, (c) => changes.push(c));

    proxy.foo = 2;
    proxy.bar = 'y';

    expect(changes).toEqual([
      {
        type: 'update',
        key: 'foo',
        oldValue: 1,
        newValue: 2,
      },
      {
        type: 'update',
        key: 'bar',
        oldValue: 'x',
        newValue: 'y',
      },
    ]);
  });

  it('should emit add when new key is assigned', () => {
    const obj = {} as TestObj;
    const changes: Change<TestObj>[] = [];
    const proxy = observeDiff(obj, (c) => changes.push(c));

    proxy.foo = 123;
    proxy.bar = 'abc';

    expect(changes).toEqual([
      {
        type: 'add',
        key: 'foo',
        oldValue: undefined,
        newValue: 123,
      },
      {
        type: 'add',
        key: 'bar',
        oldValue: undefined,
        newValue: 'abc',
      },
    ]);
  });

  it('should emit delete when property is deleted', () => {
    const obj: TestObj = { foo: 1, bar: 'x' };
    const changes: Change<TestObj>[] = [];
    const proxy = observeDiff(obj, (c) => changes.push(c));

    delete proxy.foo;
    delete proxy.bar;

    expect(changes).toEqual([
      {
        type: 'delete',
        key: 'foo',
        oldValue: 1,
        newValue: undefined,
      },
      {
        type: 'delete',
        key: 'bar',
        oldValue: 'x',
        newValue: undefined,
      },
    ]);
  });

  it('should track multiple changes on the same key in order', () => {
    const obj: TestObj = { foo: 1 };
    const changes: Change<TestObj>[] = [];
    const proxy = observeDiff(obj, (c) => changes.push(c));

    proxy.foo = 2;
    proxy.foo = 3;
    delete proxy.foo;

    expect(changes).toEqual([
      {
        type: 'update',
        key: 'foo',
        oldValue: 1,
        newValue: 2,
      },
      {
        type: 'update',
        key: 'foo',
        oldValue: 2,
        newValue: 3,
      },
      {
        type: 'delete',
        key: 'foo',
        oldValue: 3,
        newValue: undefined,
      },
    ]);
  });
});
