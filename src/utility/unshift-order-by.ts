import { SelectQueryBuilder } from 'typeorm';

export const unshiftOrderBy = <T>(
  qb: SelectQueryBuilder<T>,
  sort: string,
  order?: 'ASC' | 'DESC',
  nulls?: 'NULLS FIRST' | 'NULLS LAST',
) => {
  const currentOrderBys = Object.entries(qb.expressionMap.allOrderBys);
  qb.orderBy(sort, order, nulls);
  currentOrderBys.forEach(([key, value]) => {
    if (typeof value === 'string') {
      qb.addOrderBy(key, value);
    } else {
      qb.addOrderBy(key, value.order, value.nulls);
    }
  });
  return qb;
};
