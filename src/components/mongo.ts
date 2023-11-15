import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { Ecs, RoleInlinePolicy } from './ecs-service';
import { Size } from '../types/size';
import { commonTags } from '../constants';

export type MongoArgs = {
  /**
   * Exposed service port.
   */
  port?: pulumi.Input<number>;
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
  /**
   * A map of tags to assign to the resource.
   */
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

export class Mongo extends pulumi.ComponentResource {
  name: string;
  service: Ecs;

  constructor(
    name: string,
    args: MongoArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Mongo', name, args, opts);

    const port = args.port || 27017;

    this.name = name;
    this.service = new Ecs(
      name,
      {
        ...args,
        port,
        image:
          'mongo:jammy@sha256:238b1636bdd7820c752b91bec8a669f92568eb313ad89a1fc4a92903c1b40489',
        desiredCount: 1,
        minCount: 1,
        maxCount: 1,
        enableServiceAutoDiscovery: true,
        persistentStorageVolumePath: '/data/db',
        dockerCommand: ['mongod', '--port', port.toString()],
        assignPublicIp: false,
      },
      { ...opts, parent: this },
    );

    this.registerOutputs();
  }
}
