import * as pulumi from '@pulumi/pulumi';
import * as upstash from '@upstash/pulumi';
import { Password } from '../../../components/password';

export type RedisArgs = {
  dbName: pulumi.Input<string>;
  /**
   * Primary region for the database
   * @default 'us-east-1'
   */
  primaryRegion?: pulumi.Input<
    | 'us-east-1'
    | 'us-west-1'
    | 'us-west-2'
    | 'eu-central-1'
    | 'eu-west-1'
    | 'sa-east-1'
    | 'ap-southeast-1'
    | 'ap-southeast-2'
  >;
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

    const argsWithDefaults = Object.assign({}, defaults, args);

    const dbName =
      argsWithDefaults.dbName ?? `${pulumi.getProject()}-${pulumi.getStack()}`;

    this.instance = new upstash.RedisDatabase(
      name,
      {
        databaseName: dbName,
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
