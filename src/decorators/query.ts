import { QueryCond } from '../bases';
import { Metadata } from '../utility/metadata';
import {
  applyQueryMatchBoolean,
  applyQueryProperty,
  applyQueryPropertyLike,
  applyQueryPropertySearch,
  applyQueryPropertyZeroNullable,
} from '../utility';

export const QueryCondition = (cond: QueryCond) =>
  Metadata.set(
    'queryCondition',
    cond,
    'queryConditionFields',
  ) as PropertyDecorator;
export const QueryEqual = () => QueryCondition(applyQueryProperty);
export const QueryLike = () => QueryCondition(applyQueryPropertyLike);
export const QuerySearch = () => QueryCondition(applyQueryPropertySearch);

export const QueryEqualZeroNullable = () =>
  QueryCondition(applyQueryPropertyZeroNullable);

export const QueryMatchBoolean = () => QueryCondition(applyQueryMatchBoolean);

export const QueryOperator = (operator: string, field?: string) =>
  QueryCondition((obj, qb, entityName, key) => {
    if (obj[key] == null) return;
    const fieldName = field || key;
    const typeormField = `_query_operator_${fieldName}_${key}`;
    qb.andWhere(`${entityName}.${fieldName} ${operator} :${typeormField}`, {
      [typeormField]: obj[key],
    });
  });

const _createQueryOperator = (operator: string) => (field?: string) =>
  QueryOperator(operator, field);

export const QueryGreater = _createQueryOperator('>');
export const QueryGreaterEqual = _createQueryOperator('>=');
export const QueryLess = _createQueryOperator('<');
export const QueryLessEqual = _createQueryOperator('<=');
export const QueryNotEqual = _createQueryOperator('!=');
