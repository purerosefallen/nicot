export const observeDiff = <T>(
  obj: T,
  cb: <K extends keyof T>(change: {
    type: 'add' | 'update' | 'delete';
    key: K;
    oldValue: T[K] | undefined;
    newValue: T[K] | undefined;
  }) => any,
): T => {
  return new Proxy(obj as any, {
    set(target, key: string | symbol, value) {
      const oldValue = target[key];
      const type = Object.prototype.hasOwnProperty.call(target, key)
        ? 'update'
        : 'add';
      target[key] = value;
      cb({ type, key: key as any, oldValue, newValue: value });
      return true;
    },
    deleteProperty(target, key: string | symbol) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        const oldValue = target[key];
        delete target[key];
        cb({ type: 'delete', key: key as any, oldValue, newValue: undefined });
        return true;
      }
      return false;
    },
  });
};
