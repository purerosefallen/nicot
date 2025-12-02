import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { getSpecificFields, reflector } from './metadata';
import { AnyClass, getApiProperty } from 'nesties';
import _ from 'lodash';
import { DECORATORS } from '@nestjs/swagger/dist/constants';

export const PatchColumnsInGet = <C extends AnyClass>(
  cl: C,
  originalCl: AnyClass = cl,
  fieldsToOmit: string[] = [],
) => {
  const omit = new Set(fieldsToOmit);
  const useCl = originalCl || cl;
  const mutateFields = getSpecificFields(useCl, 'getMutator').filter(
    (f) => !omit.has(f),
  );
  for (const field of mutateFields) {
    const originalApiProp = getApiProperty(originalCl, field);
    const info = reflector.get('getMutator', useCl, field);
    Reflect.defineMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      {
        ...originalApiProp,
        type: String,
        required: false,
        example: info.example ?? undefined,
        enum: info.enum ?? undefined,
        default: undefined,
        ...(info.apiPropertyExtras || {}),
      },
      cl.prototype,
      field,
    );
  }
  const queryableFieldsRemaining = _.difference(
    getSpecificFields(useCl, 'queryCondition'),
    mutateFields,
  );
  for (const field of queryableFieldsRemaining) {
    const originalApiProp = getApiProperty(originalCl, field);
    Reflect.defineMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      {
        ...originalApiProp,
        default: undefined, // we remove every default value in get
      },
      cl.prototype,
      field,
    );
  }
  return cl;
};
