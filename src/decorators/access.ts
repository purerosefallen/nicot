import { Expose } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { Metadata } from '../utility/metadata';
import { MergePropertyDecorators } from 'nesties';

export const NotWritable = () =>
  MergePropertyDecorators([
    Expose({ groups: ['r'] }),
    IsOptional(),
    Metadata.set('notWritable', true, 'notWritableFields'),
    Metadata.set('notChangeable', true, 'notChangeableFields'),
  ]);
export const NotChangeable = () =>
  MergePropertyDecorators([
    Expose({ groups: ['r', 'c'] }),
    Metadata.set('notChangeable', true, 'notChangeableFields'),
  ]);

export const NotQueryable = () =>
  Metadata.set('notQueryable', true, 'notQueryableFields');

export const NotInResult = (options: { entityVersioningDate?: boolean } = {}) =>
  Metadata.set('notInResult', options, 'notInResultFields');
