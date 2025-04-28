import { AnyClass } from 'nesties';
import { RelationDef } from './relation-def';
import { getTypeormRelations, TypeormRelation } from './get-typeorm-relations';

export const extractRelationName = (relation: string | RelationDef) => {
  if (typeof relation === 'string') {
    return relation;
  } else {
    return relation.name;
  }
};

const typeormRelationsCache = new Map<
  AnyClass,
  Record<string, TypeormRelation>
>();

export const filterRelations = <T extends string | RelationDef>(
  cl: AnyClass,
  relations?: T[],
) => {
  const fetchTypeormRelations = (cl: AnyClass) => {
    if (typeormRelationsCache.has(cl)) {
      return typeormRelationsCache.get(cl)!;
    }
    const relations = getTypeormRelations(cl);
    const map = Object.fromEntries(
      relations.map((r) => [r.propertyName, r]),
    ) as Record<string, TypeormRelation>;
    typeormRelationsCache.set(cl, map);
    return map;
  };
  return (
    relations?.filter((r) => {
      const relationName = extractRelationName(r);
      const checkLevel = (entityClass: AnyClass, name: string): boolean => {
        const [currentLevel, ...nextLevel] = name.split('.');
        const relation = fetchTypeormRelations(entityClass)?.[currentLevel];
        if (!relation) {
          throw new Error(
            `Relation ${currentLevel} not found in ${entityClass.name} (Reading ${relationName} in ${cl.name})`,
          );
        }
        if (relation.computed) return false;
        if (!nextLevel.length) return true;
        return checkLevel(relation.propertyClass, nextLevel.join('.'));
      };
      return checkLevel(cl, relationName);
    }) || []
  );
};
