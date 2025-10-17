import * as pulumi from '@pulumi/pulumi';
import * as upstash from '@upstash/pulumi';
import * as aws from '@pulumi/aws';
import { commonTags } from '../constants';

export type RedisArgs = {
  /**
   * Redis database name.
   */
  dbName: pulumi.Input<string>;
  /**
   * Region of the database. Possible values are: "global", "eu-west-1", "us-east-1", "us-west-1", "ap-northeast-1" , "eu-central1".
   */
  region?: pulumi.Input<string>;
};

const defaults = {
  region: 'us-east-1',
};

export interface RedisOptions extends pulumi.ComponentResourceOptions {
  provider: upstash.Provider;
}

export class Redis extends pulumi.ComponentResource {
  instance: upstash.RedisDatabase;
  passwordSecret: aws.secretsmanager.Secret;
  username = 'default';

  constructor(name: string, args: RedisArgs, opts: RedisOptions) {
    super('studion:LegacyRedis', name, {}, opts);

    const project = pulumi.getProject();
    const stack = pulumi.getStack();

    const argsWithDefaults = Object.assign({}, defaults, args);

    this.instance = new upstash.RedisDatabase(
      name,
      {
        databaseName: `${argsWithDefaults.dbName}-${stack}`,
        region: argsWithDefaults.region,
        eviction: true,
        tls: true,
      },
      { provider: opts.provider, parent: this },
    );

    this.passwordSecret = new aws.secretsmanager.Secret(
      `${name}-password-secret`,
      {
        namePrefix: `${stack}/${project}/RedisPassword-`,
        tags: commonTags,
      },
      { parent: this, dependsOn: [this.instance] },
    );

    const passwordSecretValue = new aws.secretsmanager.SecretVersion(
      `${name}-password-secret-value`,
      {
        secretId: this.passwordSecret.id,
        secretString: this.instance.password,
      },
      { parent: this, dependsOn: [this.passwordSecret] },
    );

    this.registerOutputs();
  }
}
