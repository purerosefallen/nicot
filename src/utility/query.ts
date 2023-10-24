import { Brackets, SelectQueryBuilder } from 'typeorm';

export function createQueryCondition(
  cond: <T>(
    obj: T,
    qb: SelectQueryBuilder<T>,
    entityName: string,
    field: keyof T & string,
  ) =>
    | void
    | SelectQueryBuilder<any>
    | string
    | { query: string; params: Record<string, any> },
) {
  return <T>(
    obj: T,
    qb: SelectQueryBuilder<T>,
    entityName: string,
    ...fields: (keyof T & string)[]
  ) => {
    for (const field of fields) {
      if (obj[field] == null) {
        continue;
      }
      const ret = cond(obj, qb, entityName, field);
      if (typeof ret === 'string') {
        qb.andWhere(ret);
      } else if (typeof ret === 'object' && typeof ret['query'] === 'string') {
        const _ret = ret as { query: string; params: Record<string, any> };
        qb.andWhere(_ret.query, _ret.params);
      }
    }
    return qb;
  };
}

export const applyQueryProperty = createQueryCondition(
  (obj, qb, entityName, field) =>
    qb.andWhere(`${entityName}.${field} = :${field}`, { [field]: obj[field] }),
);

export const applyQueryPropertyLike = createQueryCondition(
  (obj, qb, entityName, field) =>
    qb.andWhere(`${entityName}.${field} like (:${field} || '%')`, {
      [field]: obj[field],
    }),
);

export const applyQueryPropertySearch = createQueryCondition(
  (obj, qb, entityName, field) =>
    qb.andWhere(`${entityName}.${field} like ('%' || :${field} || '%')`, {
      [field]: obj[field],
    }),
);

export const applyQueryPropertyZeroNullable = createQueryCondition(
  (obj, qb, entityName, field) => {
    if ([0, '0'].indexOf(obj[field] as any) !== -1) {
      qb.andWhere(`${entityName}.${field} IS NULL`);
    } else {
      qb.andWhere(`${entityName}.${field} = :${field}`, {
        [field]: obj[field],
      });
    }
  },
);

export const applyQueryMatchBoolean = createQueryCondition(
  (obj, qb, entityName, field) => {
    const value = obj[field] as any;
    if (value === true || value === 'true' || value === 1 || value === '1') {
      qb.andWhere(`${entityName}.${field} = TRUE`);
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      qb.andWhere(`${entityName}.${field} = FALSE`);
    }
  },
);
