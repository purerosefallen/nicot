export const Memorize = () => {
  const cache = new WeakMap<any, any>();

  return function (
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const getter = descriptor.get!;
    descriptor.get = function () {
      if (cache.has(this)) return cache.get(this);

      const value = getter.call(this);
      cache.set(this, value);
      return value;
    };
  };
};
