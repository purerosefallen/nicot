import { CrudBase, CrudService } from '../crud-base';
import { Repository } from 'typeorm';
import { ClassType } from 'nesties';
import { RelationDef } from '../utility/relation-def';

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
  _service: CrudBase<T>;
  constructor(
    serviceOrRepo: CrudBase<T> | Repository<T>,
    public _options: Partial<{
      paginateType: RestfulPaginateType;
      relations: (string | RelationDef)[];
      entityClass: ClassType<T>;
    }> = {},
  ) {
    if (serviceOrRepo instanceof CrudBase) {
      this._service = serviceOrRepo;
    } else {
      const crudServiceClass = CrudService(this._options.entityClass, {
        relations: this._options.relations,
      });
      this._service = new crudServiceClass(serviceOrRepo);
    }
  }

  findOne(id: number) {
    return this._service.findOne(id);
  }

  findAll(dto: Partial<T>) {
    if (this._options.paginateType === 'cursor') {
      return this._service.findAllCursorPaginated(dto);
    }
    if (this._options.paginateType === 'offset') {
      return this._service.findAll(dto);
    }
    dto['recordsPerPage'] ??= 99999;
    return this._service.findAll(dto);
  }

  create(dto: T) {
    return this._service.create(dto);
  }

  update(id: number, dto: Partial<T>) {
    return this._service.update(id, dto);
  }

  delete(id: number) {
    return this._service.delete(id);
  }

  import(data: { data: T[] }) {
    return this._service.importEntities(data.data);
  }
}
