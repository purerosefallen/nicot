import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';

export type AnyClass = new (...args: any[]) => any;
export type ClassOrArray = AnyClass | [AnyClass];
export type ClassType<T> = new (...args: any[]) => T;
export type TypeFromClass<T> = T extends new (...args: any[]) => infer U
  ? U
  : never;
export type ParamsFromClass<T> = T extends new (...args: infer U) => any
  ? U
  : never;
export type ParseType<IC extends ClassOrArray> = IC extends [infer U]
  ? TypeFromClass<U>[]
  : TypeFromClass<IC>;

export function getClassFromClassOrArray(o: ClassOrArray) {
  return o instanceof Array ? o[0] : o;
}

export interface InsertOptions<C extends ClassOrArray = ClassOrArray> {
  type: C;
  options?: ApiPropertyOptions;
}

type TypeFromInsertOptions<O extends InsertOptions> = O extends InsertOptions<
  infer C
>
  ? ParseType<C>
  : never;

export function InsertField<
  C extends AnyClass,
  M extends Record<string, InsertOptions>,
>(
  cl: C,
  map: M,
  newName?: string,
): new (...args: ParamsFromClass<C>) => TypeFromClass<C> & {
  [F in keyof M]: TypeFromInsertOptions<M[F]>;
} {
  const extendedCl = class extends cl {};
  for (const key in map) {
    ApiProperty({
      type: map[key].type,
      ...(map[key].options || {}),
    })(extendedCl.prototype, key);
  }
  Object.defineProperty(cl, 'name', {
    value: newName || cl.name,
  });
  return extendedCl;
}
