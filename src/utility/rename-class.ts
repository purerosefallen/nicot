export function RenameClass<T>(cls: T, name: string) {
  Object.defineProperty(cls, 'name', { value: name });
  return cls;
}
