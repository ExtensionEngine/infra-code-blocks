import * as pulumi from '@pulumi/pulumi';
import { EcsService, EcsServiceArgs } from './ecs-service';
import { Password } from './password';

export type MongoArgs = Pick<
  EcsServiceArgs,
  'size' | 'clusterId' | 'clusterName' | 'vpcId' | 'vpcCidrBlock' | 'tags'
> & {
  privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  /**
   * Username for the master DB user.
   */
  username: pulumi.Input<string>;
  /**
   * Password for the master DB user. If not specified it will be autogenerated.
   * The value will be stored as a secret in AWS Secret Manager.
   */
  password?: pulumi.Input<string>;
  /**
   * Mongo Docker image. Defaults to mongo:7.0.3.
   */
  image?: pulumi.Input<string>;
  /**
   * Exposed service port. Defaults to 27017.
   */
  port?: pulumi.Input<number>;
  /**
   * Persistent storage volume path. Defaults to '/data/db'.
   */
  persistentStorageVolumePath?: pulumi.Input<string>;
};

export class Mongo extends pulumi.ComponentResource {
  readonly name: string;
  readonly username: pulumi.Output<string>;
  readonly service: EcsService;
  readonly password: Password;

  constructor(
    name: string,
    args: MongoArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Mongo', name, args, opts);

    const image =
      args.image ||
      'mongo:7.0.3@sha256:238b1636bdd7820c752b91bec8a669f92568eb313ad89a1fc4a92903c1b40489';
    const port = args.port || 27017;
    const persistentStorageVolumePath =
      args.persistentStorageVolumePath || '/data/db';

    const { username, password, privateSubnetIds, ...ecsServiceArgs } = args;

    this.name = name;
    this.username = pulumi.output(username);

    this.password = new Password(
      `${this.name}-mongo-password`,
      { value: password },
      { parent: this },
    );

    this.service = new EcsService(
      name,
      {
        ...ecsServiceArgs,
        port,
        image,
        desiredCount: 1,
        autoscaling: { enabled: false },
        enableServiceAutoDiscovery: true,
        persistentStorageVolumePath,
        dockerCommand: ['mongod', '--port', port.toString()],
        assignPublicIp: false,
        subnetIds: privateSubnetIds,
        environment: [
          {
            name: 'MONGO_INITDB_ROOT_USERNAME',
            value: username,
          },
        ],
        secrets: [
          {
            name: 'MONGO_INITDB_ROOT_PASSWORD',
            valueFrom: this.password.secret.arn,
          },
        ],
      },
      { ...opts, parent: this },
    );

    this.registerOutputs();
  }
}
