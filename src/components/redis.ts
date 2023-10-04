import * as pulumi from '@pulumi/pulumi';
import * as upstash from '@upstash/pulumi';

export type RedisArgs = {
  dbName: pulumi.Input<string>;
  region?: pulumi.Input<string>;
};

const defaults = {
  region: 'us-east-1',
};

export interface RedisOptions extends pulumi.ComponentResourceOptions {
  provider: upstash.Provider;
}
export type RedisInstance = upstash.RedisDatabase;

export class Redis extends pulumi.ComponentResource {
  instance: RedisInstance;

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
