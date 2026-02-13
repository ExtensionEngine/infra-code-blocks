import * as pulumi from '@pulumi/pulumi';

export const commonTags = {
  Env: pulumi.getStack(),
  Project: pulumi.getProject(),
};
