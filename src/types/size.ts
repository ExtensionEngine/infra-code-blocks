import * as pulumi from '@pulumi/pulumi';
import { PredefinedSize } from '../constants';

export type CustomSize = {
  cpu: pulumi.Input<number>;
  memory: pulumi.Input<number>;
};
export type Size = keyof typeof PredefinedSize | CustomSize;
