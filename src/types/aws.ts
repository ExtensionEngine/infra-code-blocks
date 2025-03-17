import * as pulumi from '@pulumi/pulumi';

export type InlinePolicy = {
  name: pulumi.Input<string>;
  policy: pulumi.Input<string>;
};
