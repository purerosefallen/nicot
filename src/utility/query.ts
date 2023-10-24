import { SelectQueryBuilder } from 'typeorm';

export function applyQueryProperty<T>(
  obj: T,
  qb: SelectQueryBuilder<T>,
  entityName: string,
  ...fields: (keyof T & string)[]
) {
  for (const field of fields) {
    if (obj[field] == null) {
      continue;
    }
    qb.andWhere(`${entityName}.${field} = :${field}`, { [field]: obj[field] });
  }
}
export function applyQueryPropertyLike<T>(
  obj: T,
  qb: SelectQueryBuilder<T>,
  entityName: string,
  ...fields: (keyof T & string)[]
) {
  for (const field of fields) {
    if (obj[field] == null) {
      continue;
    }
    qb.andWhere(`${entityName}.${field} like (:${field} || '%')`, {
      [field]: obj[field],
    });
  }
}

export function applyQueryPropertySearch<T>(
  obj: T,
  qb: SelectQueryBuilder<T>,
  entityName: string,
  ...fields: (keyof T & string)[]
) {
  for (const field of fields) {
    if (obj[field] == null) {
      continue;
    }
    qb.andWhere(`${entityName}.${field} like ('%' || :${field} || '%')`, {
      [field]: obj[field],
    });
  }
}

export function applyQueryPropertyZeroNullable<T>(
  obj: T,
  qb: SelectQueryBuilder<T>,
  entityName: string,
  ...fields: (keyof T & string)[]
) {
  for (const field of fields) {
    if (obj[field] === undefined) {
      // Nothing
    } else if ([0, '0'].indexOf(obj[field] as any) !== -1) {
      qb.andWhere(`${entityName}.${field} IS NULL`);
    } else {
      qb.andWhere(`${entityName}.${field} = :${field}`, {
        [field]: obj[field],
      });
    }
  }
}
