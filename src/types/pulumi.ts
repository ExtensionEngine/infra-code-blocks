import * as pulumi from '@pulumi/pulumi';

export type WithInput<T extends {}> = {
  [K in keyof T]: pulumi.Input<T[K]>;
};
