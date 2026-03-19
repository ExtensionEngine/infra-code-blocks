import * as pulumi from '@pulumi/pulumi';
import { GrafanaConnection } from './connections';

export namespace Grafana {
  export type Args = {
    connections: GrafanaConnection[];
  };
}

export class Grafana extends pulumi.ComponentResource {
  connections: GrafanaConnection[];

  constructor(
    name: string,
    args: Grafana.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:Grafana', name, {}, opts);

    this.connections = args.connections;

    this.registerOutputs();
  }
}
