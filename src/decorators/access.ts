import { IsOptional } from 'class-validator';
import { Metadata } from '../utility/metadata';
import { MergePropertyDecorators } from 'nesties';

export const NotWritable = () =>
  MergePropertyDecorators([
    IsOptional(),
    Metadata.set('notWritable', true, 'notWritableFields'),
  ]);

export const NotCreatable = () =>
  MergePropertyDecorators([
    IsOptional(),
    Metadata.set('notCreatable', true, 'notCreatableFields'),
  ]);

export const NotChangeable = () =>
  MergePropertyDecorators([
    Metadata.set('notChangeable', true, 'notChangeableFields'),
  ]);

export const NotUpsertable = () =>
  MergePropertyDecorators([
    IsOptional(),
    Metadata.set('notUpsertable', true, 'notUpsertableFields'),
  ]);

export const NotQueryable = () =>
  Metadata.set('notQueryable', true, 'notQueryableFields');

export const NotInResult = () =>
  Metadata.set('notInResult', true, 'notInResultFields');
