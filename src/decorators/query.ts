import { QueryCond } from '../bases';
import { Metadata } from '../utility/metadata';
import {
  applyQueryProperty,
  applyQueryPropertyLike,
  applyQueryPropertySearch,
} from '../utility';

export const QueryCondition = (cond: QueryCond) =>
  Metadata.set('queryCondition', cond, 'queryConditionFields');
export const QueryEqual = () => QueryCondition(applyQueryProperty);
export const QueryLike = () => QueryCondition(applyQueryPropertyLike);
export const QuerySearch = () => QueryCondition(applyQueryPropertySearch);
