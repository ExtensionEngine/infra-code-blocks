import * as pulumi from '@pulumi/pulumi';
import * as upstash from '@upstash/pulumi';
import { Password } from '../../../components/password';

export type RedisArgs = {
  /**
   * Redis database name.
   */
  dbName: pulumi.Input<string>;
  /**
   * Primary region for the database (Can be one of [us-east-1, us-west-1, us-west-2, eu-central-1, eu-west-1, sa-east-1, ap-southeast-1, ap-southeast-2])
   */
  primaryRegion?: pulumi.Input<string>;
};

const defaults = {
  region: 'global',
  primaryRegion: 'us-east-1',
};

export interface RedisOptions extends pulumi.ComponentResourceOptions {
  provider: upstash.Provider;
}

export class UpstashRedis extends pulumi.ComponentResource {
  instance: upstash.RedisDatabase;
  password: Password;
  username = 'default';

  constructor(name: string, args: RedisArgs, opts: RedisOptions) {
    super('studion:Redis:Upstash', name, {}, opts);

    const stack = pulumi.getStack();

    const argsWithDefaults = Object.assign({}, defaults, args);

    this.instance = new upstash.RedisDatabase(
      name,
      {
        databaseName: `${argsWithDefaults.dbName}-${stack}`,
        region: argsWithDefaults.region,
        primaryRegion: argsWithDefaults.primaryRegion,
        eviction: true,
        tls: true,
      },
      { provider: opts.provider, parent: this },
    );

    this.password = new Password(
      `${name}-database-password`,
      { value: this.instance.password },
      { parent: this },
    );

    this.registerOutputs();
  }
}
