import * as pulumi from '@pulumi/pulumi';
import * as upstash from '@upstash/pulumi';

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

  constructor(name: string, args: RedisArgs, opts: RedisOptions) {
    super('studion:redis:Instance', name, {}, opts);

    const argsWithDefaults = Object.assign({}, defaults, args);

    this.instance = new upstash.RedisDatabase(
      name,
      {
        databaseName: argsWithDefaults.dbName,
        region: argsWithDefaults.region,
        eviction: true,
        tls: true,
      },
      { provider: opts.provider, parent: this },
    );

    this.registerOutputs();
  }
}
