import * as pulumi from '@pulumi/pulumi';
import { Ecs, EcsServiceArgs } from './ecs-service';

export type MongoArgs = Pick<
  EcsServiceArgs,
  'size' | 'cluster' | 'vpc' | 'environment' | 'secrets' | 'tags'
> & {
  /**
   * Exposed service port.
   */
  port?: pulumi.Input<number>;
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
