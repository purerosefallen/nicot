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
  Metadata.set('queryCondition', cond, 'queryConditionFields');
export const QueryEqual = () => QueryCondition(applyQueryProperty);
export const QueryLike = () => QueryCondition(applyQueryPropertyLike);
export const QuerySearch = () => QueryCondition(applyQueryPropertySearch);

export const QueryEqualZeroNullable = () =>
  QueryCondition(applyQueryPropertyZeroNullable);

export const QueryMatchBoolean = () => QueryCondition(applyQueryMatchBoolean);
