import { getSpecificFields, Metadata } from '../utility/metadata';
import { ClassType } from 'nesties';
import { Unique } from 'typeorm';

export const UpsertColumn = (): PropertyDecorator =>
  Metadata.set('upsertColumn', true, 'upsertColumnFields');

export const UpsertableEntity =
  () => (cls: ClassType<{ id: string | number }>) => {
    const upsertColumns = getSpecificFields(cls, 'upsertColumn');
    const bindingColumns = getSpecificFields(cls, 'bindingColumn');
    if (!upsertColumns.length && !bindingColumns.length) {
      throw new Error(
        `UpsertableEntity ${cls.name} must have at least one UpsertColumn or BindingColumn defined.`,
      );
    }
    Metadata.set('upsertableEntity', true)(cls);
    if (
      !bindingColumns.length &&
      upsertColumns.length === 1 &&
      upsertColumns[0] === 'id'
    ) {
      // this is only id to be primary key, so no need to do anything
      return;
    }
    Unique([...new Set([...bindingColumns, ...upsertColumns])])(cls);
  };
