import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import type { GrafanaDashboardBuilder } from './dashboards/builder';
import { GrafanaConnection } from './connections';

export namespace Grafana {
  export type Args = {
    connectionBuilders: GrafanaConnection.Builder[];
    dashboardBuilders: GrafanaDashboardBuilder.Dashboard[];
  };
}

export class Grafana extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly connections: GrafanaConnection[];
  public readonly dashboards: grafana.oss.Dashboard[];

  constructor(
    name: string,
    args: Grafana.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:Grafana', name, {}, opts);

    this.name = name;

    this.connections = args.connectionBuilders.map(build => {
      return build({ parent: this });
    });

    const folder = new grafana.oss.Folder(
      name,
      { title: name },
      { parent: this },
    );

    this.dashboards = args.dashboardBuilders.map(build => {
      return build(this.connections, folder, { parent: folder });
    });

    this.registerOutputs();
  }
}
