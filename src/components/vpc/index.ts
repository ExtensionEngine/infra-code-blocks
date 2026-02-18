import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import { commonTags } from '../../shared/common-tags';
import { enums } from '@pulumi/awsx/types';
import { mergeWithDefaults } from '../../shared/merge-with-defaults';

export type VpcArgs = {
  /**
   * Number of availability zones to which the subnets defined in subnetSpecs will be deployed
   * @default '2'
   */
  numberOfAvailabilityZones?: number;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

export const defaults = {
  numberOfAvailabilityZones: 2,
};

export class Vpc extends pulumi.ComponentResource {
  vpc: awsx.ec2.Vpc;

  constructor(
    name: string,
    args: VpcArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:vpc:Vpc', name, {}, opts);

    const argsWithDefaults = mergeWithDefaults(defaults, args);

    this.vpc = new awsx.ec2.Vpc(
      `${name}-vpc`,
      {
        numberOfAvailabilityZones: argsWithDefaults.numberOfAvailabilityZones,
        enableDnsHostnames: true,
        enableDnsSupport: true,
        subnetStrategy: enums.ec2.SubnetAllocationStrategy.Auto,
        subnetSpecs: [
          { type: awsx.ec2.SubnetType.Public, cidrMask: 24 },
          { type: awsx.ec2.SubnetType.Private, cidrMask: 24 },
          { type: awsx.ec2.SubnetType.Isolated, cidrMask: 24 },
        ],
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this },
    );

    this.registerOutputs();
  }
}
