export function MergePropertyDecorators(
  decs: PropertyDecorator[],
): PropertyDecorator {
  return (obj, key) => {
    for (const dec of decs) {
      dec(obj, key);
    }
  };
}

export function MergeMethodDecorators(
  decs: MethodDecorator[],
): MethodDecorator {
  return (obj, key, descriptor) => {
    for (const dec of decs) {
      dec(obj, key, descriptor);
    }
  };
}

export function MergeClassDecorators(decs: ClassDecorator[]): ClassDecorator {
  return (obj) => {
    for (const dec of decs) {
      dec(obj);
    }
  };
}

export function MergeParameterDecorators(
  decs: ParameterDecorator[],
): ParameterDecorator {
  return (obj, key, index) => {
    for (const dec of decs) {
      dec(obj, key, index);
    }
  };
}
