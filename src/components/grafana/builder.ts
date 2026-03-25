import * as pulumi from '@pulumi/pulumi';
import { AMPConnection, GrafanaConnection } from './connections';
import { Grafana } from './grafana';

export class GrafanaBuilder {
  private readonly name: string;
  private readonly connectionBuilders: GrafanaConnection.ConnectionBuilder[] =
    [];

  constructor(name: string) {
    this.name = name;
  }

  public addAmp(name: string, args: AMPConnection.Args): this {
    this.connectionBuilders.push(opts => new AMPConnection(name, args, opts));

    return this;
  }

  public addConnection(builder: GrafanaConnection.ConnectionBuilder): this {
    this.connectionBuilders.push(builder);

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    if (!this.connectionBuilders.length) {
      throw new Error(
        'At least one connection is required. Call addAmp() or addConnection() before build().',
      );
    }

    return new Grafana(
      this.name,
      {
        connectionBuilders: this.connectionBuilders,
      },
      opts,
    );
  }
}
