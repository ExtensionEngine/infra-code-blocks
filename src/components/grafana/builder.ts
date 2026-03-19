import * as pulumi from '@pulumi/pulumi';
import { GrafanaConnection } from './connections';
import { Grafana } from './grafana';

export class GrafanaBuilder {
  private _name: string;
  private connections: GrafanaConnection[] = [];

  constructor(name: string) {
    this._name = name;
  }

  public addConnection(connection: GrafanaConnection): this {
    this.connections.push(connection);

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    if (!this.connections.length) {
      throw new Error(
        'At least one connection is required. Call addConnection() before build().',
      );
    }

    return new Grafana(
      this._name,
      {
        connections: this.connections,
      },
      opts,
    );
  }
}
