import { AnyClass, ClassType } from 'nesties';
import { getMetadataArgsStorage } from 'typeorm';
import { getSpecificFields, reflector } from './metadata';
import _ from 'lodash';

export type TypeormRelation<T = any, KT = string> = {
  isArray: boolean;
  propertyClass: ClassType<T>;
  propertyName: KT;
  computed: boolean;
};

export function getTypeormRelations<T>(cl: ClassType<T>): TypeormRelation[] {
  const relations = getMetadataArgsStorage().relations.filter(
    (r) => r.target === cl,
  );

  const typeormRelations = relations.map((relation) => {
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
      computed: false,
    };
  });

  const computedRelations = getSpecificFields(cl, 'relationComputed').map(
    (field) => {
      const meta = reflector.get('relationComputed', cl, field);
      const res = meta();
      return {
        isArray: res.isArray,
        propertyClass: res.entityClass,
        propertyName: field,
        computed: true,
      };
    },
  );
  return _.uniqBy(
    [...typeormRelations, ...computedRelations], // Merge typeorm relations and computed relations
    (r) => r.propertyName,
  );
}

export function getTypeormRelationsMap<T>(cl: ClassType<T>) {
  return Object.fromEntries(
    getTypeormRelations(cl).map((r) => [r.propertyName, r]),
  ) as {
    [key in keyof T]: TypeormRelation<T, key>;
  };
}
