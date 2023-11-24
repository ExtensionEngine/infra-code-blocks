import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as random from '@pulumi/random';
import { commonTags } from '../constants';
import { EcsService, EcsServiceArgs } from './ecs-service';

export type MongoArgs = Pick<
  EcsServiceArgs,
  'size' | 'cluster' | 'vpcId' | 'vpcCidrBlock' | 'tags'
> & {
  /**
   * Username for the master DB user.
   */
  username: pulumi.Input<string>;
  /**
   * Password for the master DB user.
   * The value will be stored as a secret in AWS Secret Manager.
   */
  password: pulumi.Input<string>;
  privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  /**
   * Exposed service port. Defaults to 27017.
   */
  port?: pulumi.Input<number>;
};

export class Mongo extends pulumi.ComponentResource {
  name: string;
  service: EcsService;
  passwordSecret: aws.secretsmanager.Secret;

  constructor(
    name: string,
    args: MongoArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Mongo', name, args, opts);

    const port = args.port || 27017;

    const { username, password, privateSubnetIds, ...ecsServiceArgs } = args;

    this.name = name;

    const mongoPassword = password || this.createRandomPassword();
    this.passwordSecret = this.createPasswordSecret(mongoPassword);

    this.service = new EcsService(
      name,
      {
        ...ecsServiceArgs,
        port,
        image:
          'mongo:7.0.3@sha256:238b1636bdd7820c752b91bec8a669f92568eb313ad89a1fc4a92903c1b40489',
        desiredCount: 1,
        autoscaling: { enabled: false },
        enableServiceAutoDiscovery: true,
        persistentStorageVolumePath: '/data/db',
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
            valueFrom: this.passwordSecret.arn,
          },
        ],
      },
      { ...opts, parent: this },
    );

    this.registerOutputs();
  }

  private createRandomPassword() {
    return new random.RandomPassword(`${this.name}-db-password`, {
      length: 16,
      overrideSpecial: '_%$',
      special: true,
    }).result;
  }

  private createPasswordSecret(password: MongoArgs['password']) {
    const project = pulumi.getProject();
    const stack = pulumi.getStack();

    const passwordSecret = new aws.secretsmanager.Secret(
      `${this.name}-password-secret`,
      {
        namePrefix: `${stack}/${project}/MongoPassword-`,
        tags: commonTags,
      },
      { parent: this },
    );

    const passwordSecretValue = new aws.secretsmanager.SecretVersion(
      `${this.name}-password-secret-value`,
      {
        secretId: passwordSecret.id,
        secretString: password,
      },
      { parent: this, dependsOn: [passwordSecret] },
    );

    return passwordSecret;
  }
}
