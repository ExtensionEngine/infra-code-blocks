import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { commonTags } from '../constants';
import { EcsService, EcsServiceArgs } from './ecs-service';

export type MongoArgs = Pick<
  EcsServiceArgs,
  'size' | 'cluster' | 'vpc' | 'tags'
> & {
  /**
   * Exposed service port.
   */
  port?: pulumi.Input<number>;
  /**
   * Username for the master DB user.
   */
  username: pulumi.Input<string>;
  /**
   * Password for the master DB user.
   * The value will be stored as a secret in AWS Secret Manager.
   */
  password: pulumi.Input<string>;
};

export class Mongo extends pulumi.ComponentResource {
  name: string;
  service: EcsService;
  databaseSecrets: aws.ecs.Secret[];

  constructor(
    name: string,
    args: MongoArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Mongo', name, args, opts);

    const port = args.port || 27017;

    const { username, password, ...ecsArgs } = args;

    this.name = name;
    this.databaseSecrets = this.createDatabaseSecrets({ username, password });

    this.service = new EcsService(
      name,
      {
        ...ecsArgs,
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
        secrets: this.databaseSecrets,
      },
      { ...opts, parent: this },
    );

    this.registerOutputs();
  }

  private createDatabaseSecrets({
    username,
    password,
  }: Pick<MongoArgs, 'username' | 'password'>): aws.ecs.Secret[] {
    const project = pulumi.getProject();
    const stack = pulumi.getStack();

    const usernameSecret = new aws.secretsmanager.Secret(
      `${this.name}-username-secret`,
      {
        namePrefix: `${stack}/${project}/DatabaseUsername-`,
        tags: commonTags,
      },
      { parent: this },
    );

    const usernameSecretValue = new aws.secretsmanager.SecretVersion(
      `${this.name}-username-secret-value`,
      {
        secretId: usernameSecret.id,
        secretString: username,
      },
      { parent: this, dependsOn: [usernameSecret] },
    );

    const passwordSecret = new aws.secretsmanager.Secret(
      `${this.name}-password-secret`,
      {
        namePrefix: `${stack}/${project}/DatabasePassword-`,
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

    return [
      {
        name: 'MONGO_INITDB_ROOT_USERNAME',
        valueFrom: usernameSecretValue.arn,
      },
      {
        name: 'MONGO_INITDB_ROOT_PASSWORD',
        valueFrom: passwordSecretValue.arn,
      },
    ];
  }
}
