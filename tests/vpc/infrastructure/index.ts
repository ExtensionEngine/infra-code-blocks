import { next as studion } from '@studion/infra-code-blocks';
import * as pulumi from '@pulumi/pulumi';

const appName = 'vpc-test';
const stackName = pulumi.getStack();
const tags = {
  Project: appName,
  Environment: stackName,
};

const defaultVpc = new studion.Vpc(`${appName}-default`, {});

const vpc = new studion.Vpc(`${appName}`, {
  numberOfAvailabilityZones: 3,
  tags,
});

export { defaultVpc, vpc };
