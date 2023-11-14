import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { EcsService, RoleInlinePolicy } from './ecs-service';
import { Size } from '../types/size';
import { commonTags } from '../constants';

export type MongoArgs = {
  /**
   * Exposed service port.
   */
  port: pulumi.Input<number>;
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
   * Path for the healthh check request. Defaults to "/healthcheck".
   */
  healthCheckPath?: pulumi.Input<string>;
  /**
   * The aws.ecs.Cluster resource.
   */
  cluster: aws.ecs.Cluster;
  /**
   * The awsx.ec2.Vpc resource.
   */
  vpc: awsx.ec2.Vpc;
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

export class Mongo extends pulumi.ComponentResource {
  name: string;
  service: EcsService;

  constructor(
    name: string,
    args: MongoArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Mongo', name, args, opts);

    const {
      port,
      size,
      cluster,
      vpc,
      environment,
      secrets,
      healthCheckPath,
      taskExecutionRoleInlinePolicies,
      taskRoleInlinePolicies,
      tags,
    } = args;

    const securityGroup = new aws.ec2.SecurityGroup(
      `${name}-service-security-group`,
      {
        vpcId: vpc.vpcId,
        ingress: [
          {
            fromPort: port,
            toPort: port,
            protocol: 'tcp',
            cidrBlocks: [vpc.vpc.cidrBlock],
          },
        ],
        egress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: '-1',
            cidrBlocks: ['0.0.0.0/0'],
          },
        ],
        tags: commonTags,
      },
      { parent: this },
    );

    this.name = name;
    this.service = new EcsService(
      name,
      {
        image: 'mongo:latest',
        port,
        cluster,
        desiredCount: 1,
        minCount: 1,
        maxCount: 1,
        ...(size && { size }),
        environment,
        secrets,
        enableServiceAutoDiscovery: true,
        persistentStorageVolumePath: '/data/db',
        dockerCommand: ['mongod', '--port', port.toString()],
        assignPublicIp: false,
        vpc,
        securityGroup,
        ...(healthCheckPath && { healthCheckPath }),
        taskExecutionRoleInlinePolicies,
        taskRoleInlinePolicies,
        tags,
      },
      { ...opts, parent: this },
    );

    this.registerOutputs();
  }
}
