import { Expose } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { MergePropertyDecorators } from './merge';

export const NotWritable = () =>
  MergePropertyDecorators([Expose({ groups: ['r'] }), IsOptional()]);
export const NotChangeable = () => Expose({ groups: ['r', 'c'] });
