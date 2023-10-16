/* eslint-disable @typescript-eslint/ban-types */

export type RecursiveKeyOf<TObj extends Record<string, any>> = {
  [TKey in keyof TObj & string]: RecursiveKeyOfHandleValue<
    TObj[TKey],
    `${TKey}`
  >;
}[keyof TObj & string];

type RecursiveKeyOfInner<TObj extends Record<string, any>> = {
  [TKey in keyof TObj & string]: RecursiveKeyOfHandleValue<
    TObj[TKey],
    `.${TKey}`
  >;
}[keyof TObj & string];

type RecursiveKeyOfHandleValue<TValue, Text extends string> = TValue extends
  | Function
  | ((...args: any[]) => any)
  | (new (...args: any[]) => any)
  ? never
  : TValue extends Date | string | number | boolean
  ? never // Text
  : TValue extends (infer TItem)[]
  ? Text | `${Text}${RecursiveKeyOfInner<TItem>}`
  : TValue extends Record<string, any>
  ? Text | `${Text}${RecursiveKeyOfInner<TValue>}`
  : never; // Text;
