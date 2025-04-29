import { AnyClass } from 'nesties';
import { RelationDef } from './relation-def';
import { getTypeormRelations, TypeormRelation } from './get-typeorm-relations';
import { Relation, SelectQueryBuilder } from 'typeorm';

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

export const filterRelations = <T extends string | RelationDef>(
  cl: AnyClass,
  relations?: T[],
  cond: (r: TypeormRelation) => boolean = () => true,
) => {
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

export const filterAliases = (
  cl: AnyClass,
  rootAlias: string,
  aliases?: string[],
  cond: (
    r: TypeormRelation | undefined,
    field: string,
    key: string | undefined,
  ) => boolean = () => true,
) => {
  return (
    aliases?.filter((alias) => {
      const [field, key] = alias.split('.');
      if (!key || field === rootAlias) {
        return cond(undefined, field, key);
      }
      const relationLevels = [...field.split('_'), key];
      let currentClass = cl;
      for (let i = 0; i < relationLevels.length; i++) {
        const f = relationLevels[i];
        const k = relationLevels[i + 1];
        const relation = fetchTypeormRelations(currentClass)?.[f];
        if (!cond(relation, f, k)) return false;
        currentClass = relation.propertyClass;
      }
      return true;
    }) || []
  );
};

export const queryColumnOptionsFromAlias = (
  qb: SelectQueryBuilder<any>,
  cl: AnyClass,
  rootAlias: string,
  alias: string,
) => {
  const [field, key] = alias.split('.');
  if (field === rootAlias) {
    return {
      relations: [],
      column: qb.connection.getMetadata(cl)?.findColumnWithPropertyName(key),
    };
  }

  const relationLevels = field.split('_');
  let currentClass = cl;
  const relations: TypeormRelation[] = [];
  while (relationLevels.length) {
    const f = relationLevels.shift()!;
    const relation = fetchTypeormRelations(currentClass)?.[f];
    if (!relation || relation.computed) {
      return;
    }
    relations.push(relation);
    currentClass = relation.propertyClass;
  }
  return {
    relations,
    column: qb.connection
      .getMetadata(currentClass)
      ?.findColumnWithPropertyName(key),
  };
};
