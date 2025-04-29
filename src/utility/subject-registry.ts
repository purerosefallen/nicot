import { SelectQueryBuilder } from 'typeorm';

const subjectRegistry = new WeakMap<
  SelectQueryBuilder<any>,
  Record<string, string>
>();

export const addSubject = <T>(
  qb: SelectQueryBuilder<T>,
  select: string,
  alias: string,
) => {
  let subjects = subjectRegistry.get(qb);
  if (!subjects) {
    subjects = {};
    subjectRegistry.set(qb, subjects);
  }
  subjects[alias] = select;
  return qb.addSelect(select, alias);
};

export const getSubject = <T>(
  qb: SelectQueryBuilder<T>,
  alias: string,
): string | undefined => {
  return subjectRegistry.get(qb)?.[alias];
};
