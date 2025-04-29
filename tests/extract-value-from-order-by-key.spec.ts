import { extractValueFromOrderByKey } from '../src/utility/cursor-pagination-utils';

describe('extractValueFromOrderByKey', () => {
  it('should work', () => {
    expect(extractValueFromOrderByKey({ foo: 1 }, 'root.foo', 'root')).toBe(1);
    expect(
      extractValueFromOrderByKey({ foo: { bar: 1 } }, 'foo.bar', 'root'),
    ).toBe(1);
    expect(
      extractValueFromOrderByKey(
        { foo: { bar: [1, 2, 3] } },
        'foo.bar',
        'root',
      ),
    ).toBeUndefined();
    expect(
      extractValueFromOrderByKey(
        { foo: { bar: [{}, { baz: [1, 2, 3] }] } },
        'foo_bar.baz',
        'root',
      ),
    ).toBeUndefined();
  });
});
