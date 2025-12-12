import { QueryCond } from '../bases';
import { Metadata, reflector } from '../utility/metadata';
import { QueryFullTextColumnOptions } from '../utility/query-full-text-column-options.interface';
import { MergePropertyDecorators } from 'nesties';
import { unshiftOrderBy } from '../utility/unshift-order-by';
import { addSubject } from '../utility/subject-registry';
import { parseBool } from '../utility/parse-bool';
import { Brackets, SelectQueryBuilder } from 'typeorm';

export const QueryCondition = (cond: QueryCond) =>
  Metadata.set(
    'queryCondition',
    cond,
    'queryConditionFields',
  ) as PropertyDecorator;

export const QueryManual = () =>
  QueryCondition((obj, qb, entityName, key) => {});

export class QueryWrapInfo<T = unknown> {
  private _value: T;

  constructor(
    public readonly obj: any,
    public readonly key: string,
    public readonly field: string,
  ) {
    this._value = obj[key];
  }

  get value() {
    return this._value;
  }

  mutateValue(next: T) {
    this._value = next;
  }
}

export type QueryWrapper = (
  entityExpr: string,
  varExpr: string,
  info: QueryWrapInfo<any>,
) => string | undefined;

const queryWrapCounters = new WeakMap<any, Record<string, number>>();
const getQueryVarName = (obj: any, key: string) => {
  const queryCounters = queryWrapCounters.get(obj) || {};
  let useField = `_qw_` + key;
  if (queryCounters[key] == null) {
    queryCounters[key] = 0;
  } else {
    useField += `__${queryCounters[key].toString(36)}`;
    ++queryCounters[key];
  }
  queryWrapCounters.set(obj, queryCounters);
  return useField;
};

export const QueryWrap = (wrapper: QueryWrapper, field?: string) =>
  QueryCondition((obj, qb, entityName, key) => {
    if (obj[key] == null) return;
    const fieldName = field || key;
    const varField = getQueryVarName(obj, key);
    const entityExpr = `${entityName}.${fieldName}`;
    const varExpr = `:${varField}`;

    const info = new QueryWrapInfo<any>(obj, key, fieldName);

    const expr = wrapper(entityExpr, varExpr, info);
    if (expr) {
      qb.andWhere(expr, {
        [varField]: info.value,
      });
    }
  });

export const createQueryWrap = (wrapper: QueryWrapper) => (field?: string) =>
  QueryWrap(wrapper, field);

export const QueryLike = createQueryWrap(
  (entityExpr, varExpr) => `${entityExpr} LIKE (${varExpr} || '%')`,
);
export const QuerySearch = createQueryWrap(
  (entityExpr, varExpr) => `${entityExpr} LIKE ('%' || ${varExpr} || '%')`,
);
export const QueryEqualZeroNullable = createQueryWrap(
  (entityExpr, varExpr, info) =>
    [0, '0'].indexOf(info.value) !== -1
      ? `${entityExpr} IS NULL`
      : `${entityExpr} = ${varExpr}`,
);
export const QueryMatchBoolean = createQueryWrap(
  (entityExpr, varExpr, info) => {
    const value = parseBool(info.value);
    if (value === true) {
      return `${entityExpr} = TRUE`;
    }
    if (value === false) {
      return `${entityExpr} = FALSE`;
    }
  },
);
export const QueryMatchBooleanMySQL = createQueryWrap(
  (entityExpr, varExpr, info) => {
    const value = parseBool(info.value);
    if (value === true) {
      return `${entityExpr} = 1`;
    }
    if (value === false) {
      return `${entityExpr} = 0`;
    }
  },
);

export const QueryOperator = (operator: string, field?: string) =>
  QueryWrap(
    (entityExpr, varExpr) => `${entityExpr} ${operator} ${varExpr}`,
    field,
  );

export const createQueryOperator = (operator: string) => (field?: string) =>
  QueryOperator(operator, field);

export const QueryEqual = createQueryOperator('=');
export const QueryGreater = createQueryOperator('>');
export const QueryGreaterEqual = createQueryOperator('>=');
export const QueryLess = createQueryOperator('<');
export const QueryLessEqual = createQueryOperator('<=');
export const QueryNotEqual = createQueryOperator('!=');
export const QueryJsonbHas = createQueryOperator('?');

export const createQueryArrayify = (
  newWrapper: QueryWrapper,
  singleFallbackWrapper?: QueryWrapper,
) =>
  createQueryWrap((entityExpr, varExpr, info) => {
    const value = info.value;
    const items = Array.isArray(value)
      ? value
      : typeof value === 'string'
      ? value.split(',')
      : [value];
    if (items.length === 1 && singleFallbackWrapper) {
      const singleRes = singleFallbackWrapper(entityExpr, varExpr, info);
      if (singleRes) {
        info.mutateValue(items[0]);
        return singleRes;
      }
    }
    info.mutateValue(items);
    const newVarExpr = `(:...${varExpr.slice(1)})`;
    return newWrapper(entityExpr, newVarExpr, info);
  });

export const createQueryOperatorArrayify = (
  operator: string,
  singleFallback?: string | QueryWrapper,
) =>
  createQueryArrayify(
    (entityExpr, varExpr) => `${entityExpr} ${operator} ${varExpr}`,
    typeof singleFallback === 'string'
      ? singleFallback.length
        ? (entityExpr, varExpr) => `${entityExpr} ${singleFallback} ${varExpr}`
        : undefined
      : singleFallback,
  );

export const QueryIn = createQueryOperatorArrayify('IN', '=');
export const QueryNotIn = createQueryOperatorArrayify('NOT IN', '!=');

export const QueryFullText = (options: QueryFullTextColumnOptions = {}) => {
  const configurationName = options.parser
    ? `nicot_parser_${options.parser}`
    : options.configuration || 'english';
  const tsQueryFunction = options.tsQueryFunction || 'websearch_to_tsquery';
  return MergePropertyDecorators([
    QueryCondition((obj, qb, entityName, key) => {
      if (obj[key] == null) return;
      const fieldName = key;
      const typeormField = getQueryVarName(obj, key);

      const tsVectorStatement = `to_tsvector('${configurationName}', "${entityName}"."${fieldName}")`;
      const tsQueryStatement = `${tsQueryFunction}('${configurationName}', :${typeormField})`;

      qb.andWhere(`${tsVectorStatement} @@ ${tsQueryStatement}`, {
        [typeormField]: obj[key],
      });

      if (options.orderBySimilarity) {
        const rankVirtualField = `_fulltext_rank_${key}`;
        addSubject(
          qb,
          `ts_rank(${tsVectorStatement}, ${tsQueryStatement})`,
          rankVirtualField,
        );
        unshiftOrderBy(qb, `"${rankVirtualField}"`, 'DESC');
      }
    }),
    Metadata.set(
      'queryFullTextColumn',
      {
        ...options,
        configuration: configurationName,
      },
      'queryFullTextColumnFields',
    ),
  ]);
};

export const QueryAnd = (...decs: PropertyDecorator[]) => {
  const conditions = decs.map((dec) =>
    reflector.getMetadataFromDecorator(dec, 'queryCondition'),
  );
  return QueryCondition((obj, qb, entityName, key) =>
    conditions.forEach((cond) => cond(obj, qb, entityName, key)),
  );
};

export const QueryOr = (...decs: PropertyDecorator[]) => {
  const conditions = decs.map((dec) =>
    reflector.getMetadataFromDecorator(dec, 'queryCondition'),
  );
  return QueryCondition((obj, qb, entityName, key) => {
    if (!conditions.length) {
      return;
    }
    qb.andWhere(
      new Brackets((orQb) => {
        const innerBrackets = conditions.map(
          (cond) =>
            new Brackets((andQb) => {
              cond(obj, andQb as SelectQueryBuilder<any>, entityName, key);
            }),
        );
        const [first, ...rest] = innerBrackets;
        orQb.where(first);
        rest.forEach((bracket) => orQb.orWhere(bracket));
      }),
    );
  });
};
