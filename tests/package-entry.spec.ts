import * as nicot from 'nicot';

describe('package ESM entry', () => {
  test('loads the public API through the import condition', () => {
    expect(nicot.RestfulFactory).toBeTypeOf('function');
    expect(nicot.CrudBase).toBeTypeOf('function');
    expect(nicot.TransactionalTypeOrmModule).toBeTypeOf('function');
  });
});
