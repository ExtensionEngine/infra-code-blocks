import * as pulumi from '@pulumi/pulumi';
import * as upstash from '@upstash/pulumi';
import { Password } from '../password';
import { mergeWithDefaults } from '../../shared/merge-with-defaults';

export namespace UpstashRedis {
  export type Args = {
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
}

const defaults = {
  region: 'global',
  primaryRegion: 'us-east-1',
};

export class UpstashRedis extends pulumi.ComponentResource {
  name: string;
  instance: upstash.RedisDatabase;
  password: Password;

  constructor(
    name: string,
    args: UpstashRedis.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super(
      'studion:redis:UpstashRedis',
      name,
      {},
      {
        ...opts,
        aliases: [...(opts.aliases || []), { type: 'studion:Redis' }],
      },
    );

    const dbName = `${pulumi.getProject()}-${pulumi.getStack()}`;
    const argsWithDefaults = mergeWithDefaults({ ...defaults, dbName }, args);

    this.name = name;
    this.instance = new upstash.RedisDatabase(
      `${this.name}-database`,
      {
        databaseName: argsWithDefaults.dbName,
        region: argsWithDefaults.region,
        primaryRegion: argsWithDefaults.primaryRegion,
        eviction: true,
        tls: true,
      },
      { parent: this },
    );

    this.password = new Password(
      `${this.name}-database-password`,
      { value: this.instance.password },
      { parent: this },
    );

    this.registerOutputs();
  }
}
