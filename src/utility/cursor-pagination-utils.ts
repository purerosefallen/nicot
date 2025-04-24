import { Brackets, SelectQueryBuilder } from 'typeorm';
import _ from 'lodash';
import SJSON from 'superjson';

export type TypeormOrderByObject = {
  order: 'ASC' | 'DESC';
  nulls?: 'NULLS FIRST' | 'NULLS LAST';
};
export type TypeormOrderByKey = 'ASC' | 'DESC';
export type TypeormOrderBy = ('ASC' | 'DESC') | TypeormOrderByObject;

function getValueFromOrderBy(orderBy: TypeormOrderBy): TypeormOrderByKey {
  return typeof orderBy === 'string' ? orderBy : orderBy.order;
}

function getOperator(type: 'prev' | 'next', orderBy: TypeormOrderBy) {
  const value = getValueFromOrderBy(orderBy);
  const isBackwards = (type === 'prev') !== (value === 'DESC');
  return isBackwards ? '<' : '>';
}

function getReversedTypeormOrderBy(
  orderBy: TypeormOrderBy | string,
): TypeormOrderByObject {
  if (typeof orderBy === 'string') {
    return {
      order: orderBy === 'ASC' ? 'DESC' : 'ASC',
      nulls: undefined,
    };
  }
  return {
    order: orderBy.order === 'ASC' ? 'DESC' : 'ASC',
    nulls: orderBy.nulls
      ? orderBy.nulls === 'NULLS FIRST'
        ? 'NULLS LAST'
        : 'NULLS FIRST'
      : undefined,
  };
}

function reverseQueryOrderBy(qb: SelectQueryBuilder<any>) {
  const orderBys = getTypeormOrderBy(qb);
  orderBys.forEach(({ key, direction }, i) => {
    const reversed = getReversedTypeormOrderBy(direction);
    if (i === 0) {
      qb.orderBy(key, reversed.order, reversed.nulls);
    } else {
      qb.addOrderBy(key, reversed.order, reversed.nulls);
    }
  });
}

function getTypeormOrderBy(
  qb: SelectQueryBuilder<any>,
): { key: string; direction: TypeormOrderBy }[] {
  const orderBy = qb.expressionMap.allOrderBys;
  const orderByEntrys = Object.entries(orderBy);
  return orderByEntrys.map(([key, value]) => ({
    key,
    direction: value,
  }));
}

export function extractValueFromOrderByKey(
  obj: any,
  key: string,
  entityAliasName?: string,
) {
  const getField = (obj, key) => {
    const value = obj[key];
    if (!value) return undefined;
    if (Array.isArray(value)) {
      if (!value.length) {
        return undefined;
      }
      return value[value.length - 1];
    }
    return value;
  };
  const [alias, field] = key.split('.');
  if (alias === entityAliasName) {
    return getField(obj, field);
  }
  const aliasParts = alias.split('_');

  if (aliasParts.length === 1) {
    const value = getField(obj, alias);
    if (!value) return undefined;
    return getField(value, field);
  }
  const value = getField(obj, aliasParts[0]);
  if (!value) return undefined;
  return extractValueFromOrderByKey(
    value,
    `${aliasParts.slice(1).join('_')}.${field}`,
  );
}

function encodeBase64Url(str: string) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeBase64Url(str: string) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

export async function getPaginatedResult<T>(
  qb: SelectQueryBuilder<T>,
  entityAliasName: string,
  take: number,
  cursor?: string,
) {
  const orderBys = getTypeormOrderBy(qb);
  qb.take(take + 1);

  let type: 'prev' | 'next' = 'next';
  if (cursor) {
    // cursor is base64url encoded string
    const data = SJSON.parse(decodeBase64Url(cursor)) as {
      type: 'prev' | 'next';
      payload: any;
    };

    type = data.type;

    const keys = Object.keys(data.payload).filter(
      (k) => qb.expressionMap.orderBys[k],
    );
    if (keys.length) {
      const staircasedKeys = keys.map((key, i) =>
        _.range(i + 1).map((j) => keys[j]),
      );

      const cursorKey = (key: string) => `_cursor_${key.replace(/\./g, '__')}`;

      qb.andWhere(
        new Brackets((sqb) => {
          const brackets = staircasedKeys.map(
            (keys, i) =>
              new Brackets((ssqb) => {
                const expressions = keys.map((key, j) => {
                  const paramKey = cursorKey(key);
                  const operator =
                    j === keys.length - 1
                      ? `${getOperator(
                          data.type,
                          qb.expressionMap.orderBys[key],
                        )}`
                      : '=';
                  return `${key} ${operator} :${paramKey}`;
                });
                const [firstExpression, ...restExpressions] = expressions;
                ssqb.where(firstExpression);
                restExpressions.forEach((expression) =>
                  ssqb.andWhere(expression),
                );
              }),
          );
          const [firstBrackets, ...restBrackets] = brackets;
          sqb.where(firstBrackets);
          restBrackets.forEach((brackets) => sqb.orWhere(brackets));
        }),
      ).setParameters(_.mapKeys(data.payload, (_, key) => cursorKey(key)));
    }
    if (data.type === 'prev') {
      reverseQueryOrderBy(qb);
    }
  }

  const data = await qb.getMany();

  const enough = data.length > take;
  const hasNext = enough || type === 'prev';
  const hasPrev = cursor && (enough || type === 'next');
  if (enough) {
    data.pop();
  }
  if (type === 'prev') {
    data.reverse();
  }

  const generateCursor = (type: 'prev' | 'next', data: T[]) => {
    const targetObject = type === 'prev' ? data[0] : data[data.length - 1];
    const payload = Object.fromEntries(
      orderBys.map(({ key }) => {
        const value = extractValueFromOrderByKey(
          targetObject,
          key,
          entityAliasName,
        );
        return [key, value];
      }),
    );
    return encodeBase64Url(SJSON.stringify({ type, payload }));
  };

  return {
    data,
    paginatedResult: {
      nextCursor: hasNext ? generateCursor('next', data) : undefined,
      previousCursor: hasPrev ? generateCursor('prev', data) : undefined,
    },
  };
}
