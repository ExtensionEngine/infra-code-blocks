import * as pulumi from '@pulumi/pulumi';
import { EcsService } from './ecs-service';

export class Mongo extends pulumi.ComponentResource {
  name: string;
  service: EcsService;

  constructor(
    name: string,
    args: MongoArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Mongo', name, args, opts);

    this.name = name;
    this.service = new EcsService(
      name,
      {
        image: 'mongo',
        dockerCommand: ['mongod', '--port', port.toString()],
        desiredCount: 1,
        minCount: 1,
        maxCount: 1,
        enableServiceAutoDiscovery: true,
        persistentStorageVolumePath: '/data/db',
        assignPublicIp: false
        port,
        cluster,
        vpc,
        size,
        environment,
        secrets,
      },
      { ...opts, parent: this },
    );

    this.registerOutputs();
  }
}
