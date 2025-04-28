import { QueryCond } from '../bases';
import { Metadata } from '../utility/metadata';
import {
  applyQueryMatchBoolean,
  applyQueryProperty,
  applyQueryPropertyLike,
  applyQueryPropertySearch,
  applyQueryPropertyZeroNullable,
} from '../utility';
import { QueryFullTextColumnOptions } from '../utility/query-full-text-column-options.interface';
import { MergePropertyDecorators } from 'nesties';

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
    const typeormField = `_query_operator_${entityName}_${fieldName}_${key}`;
    qb.andWhere(`${entityName}.${fieldName} ${operator} :${typeormField}`, {
      [typeormField]: obj[key],
    });
  });

export const createQueryOperator = (operator: string) => (field?: string) =>
  QueryOperator(operator, field);

export const QueryGreater = createQueryOperator('>');
export const QueryGreaterEqual = createQueryOperator('>=');
export const QueryLess = createQueryOperator('<');
export const QueryLessEqual = createQueryOperator('<=');
export const QueryNotEqual = createQueryOperator('!=');

export const QueryFullText = (options: QueryFullTextColumnOptions = {}) => {
  const configurationName = options.parser
    ? `nicot_parser_${options.parser}`
    : options.configuration || 'english';
  const tsQueryFunction = options.tsQueryFunction || 'websearch_to_tsquery';
  return MergePropertyDecorators([
    QueryCondition((obj, qb, entityName, key) => {
      if (obj[key] == null) return;
      const fieldName = key;
      const typeormField = key;

      qb.andWhere(
        `to_tsvector('${configurationName}', "${entityName}"."${fieldName}") @@ ${tsQueryFunction}('${configurationName}', :${typeormField})`,
        {
          [typeormField]: obj[key],
        },
      );
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
