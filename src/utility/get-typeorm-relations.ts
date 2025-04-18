import { AnyClass, ClassType } from 'nesties';
import { getMetadataArgsStorage } from 'typeorm';

export function getTypeormRelations<T>(cl: ClassType<T>) {
  const relations = getMetadataArgsStorage().relations.filter(
    (r) => r.target === cl,
  );

  return relations.map((relation) => {
    const isArray = relation.relationType.endsWith('-many');
    const relationClassFactory = relation.type;
    // check if it's a callable function
    let propertyClass: AnyClass;
    if (typeof relationClassFactory === 'function') {
      const relationClass = (relationClassFactory as () => AnyClass)();
      if (typeof relationClass === 'function') {
        propertyClass = relationClass;
      }
    }
    if (!propertyClass) {
      propertyClass = Reflect.getMetadata(
        'design:type',
        cl.prototype,
        relation.propertyName,
      );
    }
    return {
      isArray,
      propertyClass,
      propertyName: relation.propertyName,
    };
  });
}

export function getTypeormRelationsMap<T>(cl: ClassType<T>) {
  return Object.fromEntries(
    getTypeormRelations(cl).map((r) => [r.propertyName, r]),
  ) as {
    [key in keyof T]: {
      isArray: boolean;
      propertyClass: ClassType<T[key]>;
      propertyName: key;
    };
  };
}
