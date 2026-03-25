import * as pulumi from '@pulumi/pulumi';
import { GrafanaConnection } from './connections';

export namespace Grafana {
  export type Args = {
    connectionBuilders: GrafanaConnection.ConnectionBuilder[];
  };
}

export class Grafana extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly connections: GrafanaConnection[];

  constructor(
    name: string,
    args: Grafana.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:Grafana', name, {}, opts);

    this.name = name;

    this.connections = args.connectionBuilders.map(buildConnection =>
      buildConnection({ parent: this }),
    );

    this.registerOutputs();
  }
}
