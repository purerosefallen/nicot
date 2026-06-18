import { QueryCond } from '../bases';
import { Metadata, reflector } from '../utility/metadata';
import { QueryFullTextColumnOptions } from '../utility/query-full-text-column-options.interface';
import { MergePropertyDecorators } from 'nesties';
import { unshiftOrderBy } from '../utility/unshift-order-by';
import { addSubject } from '../utility/subject-registry';
import { parseBool } from 'nesties';
import { Brackets, SelectQueryBuilder } from 'typeorm';
import {
  Base64BinaryStorage,
  base64OrBinaryToDatabaseValue,
} from '../utility/base64-binary';

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

export interface QueryBase64Options {
  field?: string;
  binaryStorage?: Base64BinaryStorage;
}

const normalizeQueryBase64Options = (
  fieldOrOptions?: string | QueryBase64Options,
): QueryBase64Options =>
  typeof fieldOrOptions === 'string'
    ? { field: fieldOrOptions }
    : fieldOrOptions ?? {};

const toBase64QueryValue = (
  value: unknown,
  storage: Base64BinaryStorage = 'postgres-bytea',
): Buffer | string | unknown => {
  if (value == null) {
    return value;
  }
  return base64OrBinaryToDatabaseValue(value as string | Buffer, storage);
};

/**
 * Builds a query condition for a `Base64BinaryColumn`. The incoming base64
 * string (the API-facing form) is decoded into a PostgreSQL-safe bytea hex
 * parameter right before it is bound, so it can be compared against the raw
 * binary stored in the database. A value that is already binary (Buffer /
 * Uint8Array / ArrayBuffer) is used as that binary payload.
 */
export const createQueryBase64Operator =
  (operator: string) => (fieldOrOptions?: string | QueryBase64Options) => {
    const options = normalizeQueryBase64Options(fieldOrOptions);
    return QueryWrap((entityExpr, varExpr, info) => {
      info.mutateValue(toBase64QueryValue(info.value, options.binaryStorage));
      return `${entityExpr} ${operator} ${varExpr}`;
    }, options.field);
  };

export const QueryBase64Equal = createQueryBase64Operator('=');
export const QueryBase64NotEqual = createQueryBase64Operator('!=');

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
