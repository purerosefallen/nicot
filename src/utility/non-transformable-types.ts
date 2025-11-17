// eslint-disable-next-line @typescript-eslint/ban-types
export const nonTransformableTypes = new Set<Function>([
  // Primitive wrappers
  String,
  Number,
  Boolean,
  BigInt,
  Symbol,

  // Built-ins
  Date,
  RegExp,
  Error,
  Array,
  Object,
  Function,
  Promise,

  // Collections
  Map,
  Set,
  WeakMap,
  WeakSet,

  // Node / Buffer
  Buffer,
  ArrayBuffer,
  SharedArrayBuffer,
  DataView,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,

  // URL stuff
  URL,
  URLSearchParams,
]);
