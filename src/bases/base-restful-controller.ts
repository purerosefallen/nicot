import { CrudBase, CrudService, RelationDef } from '../crud-base';
import { Repository } from 'typeorm';
import { ClassType } from 'nesties';

export const RestfulMethods = [
  'findOne',
  'findAll',
  'create',
  'update',
  'delete',
  'import',
] as const;

export type RestfulMethods = typeof RestfulMethods[number];

export type RestfulPaginateType = 'offset' | 'cursor' | 'none';

export class BaseRestfulController<T extends { id: any }> {
  service: CrudBase<T>;
  constructor(
    serviceOrRepo: CrudBase<T> | Repository<T>,
    public _options: Partial<{
      paginateType: RestfulPaginateType;
      relations: (string | RelationDef)[];
      entityClass: ClassType<T>;
    }> = {},
  ) {
    if (serviceOrRepo instanceof CrudBase) {
      this.service = serviceOrRepo;
    } else {
      const crudServiceClass = CrudService(this._options.entityClass, {
        relations: this._options.relations,
      });
      this.service = new crudServiceClass(serviceOrRepo);
    }
  }

  findOne(id: number) {
    return this.service.findOne(id);
  }

  findAll(dto: Partial<T>) {
    if (this._options.paginateType === 'cursor') {
      return this.service.findAllCursorPaginated(dto);
    }
    if (this._options.paginateType === 'offset') {
      return this.service.findAll(dto);
    }
    dto['recordsPerPage'] ??= 99999;
    return this.service.findAll(dto);
  }

  create(dto: T) {
    return this.service.create(dto);
  }

  update(id: number, dto: Partial<T>) {
    return this.service.update(id, dto);
  }

  delete(id: number) {
    return this.service.delete(id);
  }

  import(data: { data: T[] }) {
    return this.service.importEntities(data.data);
  }
}
