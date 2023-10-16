/* eslint-disable @typescript-eslint/ban-types */

export type RecursiveKeyOf<TObj extends Record<string, any>> = {
  [TKey in keyof TObj & string]: RecursiveKeyOfHandleValue<
    TObj[TKey],
    `${TKey}`
  >;
}[keyof TObj & string];

type RecursiveKeyOfInner<
  TObj extends Record<string, any>,
  UsedTypes = never,
> = {
  [TKey in keyof TObj & string]: RecursiveKeyOfHandleValue<
    TObj[TKey],
    `.${TKey}`,
    UsedTypes
  >;
}[keyof TObj & string];

type RecursiveKeyOfHandleValue<
  TValue,
  Text extends string,
  UsedTypes = never,
> = TValue extends
  | Function
  | ((...args: any[]) => any)
  | (new (...args: any[]) => any)
  | UsedTypes
  ? never
  : TValue extends Date | string | number | boolean
  ? never // Text
  : TValue extends (infer TItem)[]
  ? Text | `${Text}${RecursiveKeyOfInner<TItem, UsedTypes | TItem>}`
  : TValue extends Record<string, any>
  ? Text | `${Text}${RecursiveKeyOfInner<TValue, UsedTypes | TValue>}`
  : never; // Text;
