import { ApiProperty } from '@nestjs/swagger';
import { getSpecificFields } from './metadata';
import { AnyClass, getApiProperty } from 'nesties';

export const PatchColumnsInGet = <C extends AnyClass>(
  cl: C,
  originalCl: AnyClass = cl,
  fieldsToOmit: string[] = [],
) => {
  const omit = new Set(fieldsToOmit);
  const boolFields = getSpecificFields(originalCl || cl, 'boolColumn').filter(
    (f) => !omit.has(f),
  );
  for (const field of boolFields) {
    const originalApiProp = getApiProperty(originalCl, field);
    ApiProperty({
      ...originalApiProp,
      type: String,
      required: false,
      enum: ['0', '1'],
      default:
        originalApiProp?.default === true
          ? '1'
          : originalApiProp?.default === false
          ? '0'
          : undefined,
    })(cl.prototype, field);
  }
  return cl;
};
