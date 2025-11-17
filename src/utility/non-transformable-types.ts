export const nonTransformableTypes = new Set<new () => any>([
  String,
  Number,
  Boolean,
  Date,
  Array,
]);
