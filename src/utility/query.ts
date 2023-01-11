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
