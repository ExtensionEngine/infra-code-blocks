import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { Size } from '../types/size';
import { commonTags } from '../constants';

const config = new pulumi.Config('aws');
export const awsRegion = config.require('region');

export const assumeRolePolicy: aws.iam.PolicyDocument = {
  Version: '2012-10-17',
  Statement: [
    {
      Action: 'sts:AssumeRole',
      Principal: {
        Service: 'ecs-tasks.amazonaws.com',
      },
      Effect: 'Allow',
      Sid: '',
    },
  ],
};

export type RoleInlinePolicy = {
  /**
   * Name of the role policy.
   */
  name?: pulumi.Input<string>;
  /**
   * Policy document as a JSON formatted string.
   */
  policy?: pulumi.Input<string>;
};

export type EcsArgs = {
  /**
   * The ECR image used to start a container.
   */
  image: pulumi.Input<string>;
  /**
   * Exposed service port.
   */
  port: pulumi.Input<number>;
  /**
   * The aws.ecs.Cluster resource.
   */
  cluster: aws.ecs.Cluster;
  /**
   * The awsx.ec2.Vpc resource.
   */
  vpc: awsx.ec2.Vpc;
  /**
   * CPU and memory size used for running the container. Defaults to "small".
   * Available predefined options are:
   * - small (0.25 vCPU, 0.5 GB memory)
   * - medium (0.5 vCPU, 1 GB memory)
   * - large (1 vCPU memory, 2 GB memory)
   * - xlarge (2 vCPU, 4 GB memory)
   */
  size?: pulumi.Input<Size>;
  /**
   * The environment variables to pass to a container. Don't use this field for
   * sensitive information such as passwords, API keys, etc. For that purpose,
   * please use the `secrets` property.
   * Defaults to [].
   */
  environment?: aws.ecs.KeyValuePair[];
  /**
   * The secrets to pass to the container. Defaults to [].
   */
  secrets?: aws.ecs.Secret[];
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
  /**
   * A map of tags to assign to the resource.
   */
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

export class Ecs extends pulumi.ComponentResource {
  name: string;
  logGroup: aws.cloudwatch.LogGroup;

  constructor(
    type: string,
    name: string,
    args: EcsArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super(type, name, {}, opts);

    this.name = name;
    this.logGroup = this.createLogGroup();

    this.registerOutputs();
  }

  private createLogGroup() {
    const logGroup = new aws.cloudwatch.LogGroup(
      `${this.name}-log-group`,
      {
        retentionInDays: 14,
        namePrefix: `/ecs/${this.name}-`,
        tags: commonTags,
      },
      { parent: this },
    );
    return logGroup;
  }
}
