import { Metadata } from '../utility/metadata';

export interface BindingValueMetadata {
  bindingKey: string;
  isMethod: boolean;
}

export const DefaultBindingKey = 'default';

export const BindingColumn = (
  bindingKey = DefaultBindingKey,
): PropertyDecorator =>
  Metadata.set('bindingColumn', bindingKey, 'bindingColumnFields');

export const BindingValue =
  (bindingKey = DefaultBindingKey): PropertyDecorator & MethodDecorator =>
  (obj: any, key: string, des?: TypedPropertyDescriptor<any>) => {
    const isMethod = !!des;
    Metadata.set(
      'bindingValue',
      { bindingKey, isMethod },
      'bindingValueFields',
    )(obj, key);
  };
