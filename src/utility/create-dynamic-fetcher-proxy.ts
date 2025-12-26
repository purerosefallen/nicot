// eslint-disable-next-line @typescript-eslint/ban-types
export const createDynamicFetcherProxy = <T extends object>(
  initial: T,
  fetcher: () => T,
) => {
  return new Proxy(initial, {
    get(_target, prop, receiver) {
      const current = fetcher();

      // 重要：用 Reflect.get 保留 getter / 原型链行为
      const value = Reflect.get(current, prop, receiver);

      // 如果是方法，绑定 this 到当前的对象
      if (typeof value === 'function') {
        return value.bind(current);
      }
      return value;
    },

    set(_target, prop, value, receiver) {
      const current = fetcher();
      return Reflect.set(current, prop, value, receiver);
    },

    has(_target, prop) {
      const current = fetcher();
      return Reflect.has(current, prop);
    },

    ownKeys(_target) {
      const current = fetcher();
      return Reflect.ownKeys(current);
    },

    getOwnPropertyDescriptor(_target, prop) {
      const current = fetcher();
      return Reflect.getOwnPropertyDescriptor(current, prop);
    },

    defineProperty(_target, prop, descriptor) {
      const current = fetcher();
      return Reflect.defineProperty(current, prop, descriptor);
    },

    deleteProperty(_target, prop) {
      const current = fetcher();
      return Reflect.deleteProperty(current, prop);
    },
  }) as T;
};
