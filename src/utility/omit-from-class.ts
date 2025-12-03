import { AnyClass } from 'nesties';

export type OmitFromClass<C extends AnyClass, K extends InstanceType<C>> = new (
  ...args: ConstructorParameters<C>
) => Omit<InstanceType<C>, K>;

export type PickFromClass<
  C extends AnyClass,
  K extends keyof InstanceType<C>,
> = new (...args: ConstructorParameters<C>) => Pick<InstanceType<C>, K>;
