import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaDashboard } from './dashboards/types';
import { GrafanaConnection } from './connections';

export namespace Grafana {
  export type Args = {
    connectionBuilders: GrafanaConnection.ConnectionBuilder[];
    dashboardBuilders?: GrafanaDashboard.DashboardBuilder[];
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

    this.connections = args.connectionBuilders.map(build =>
      build({ parent: this }),
    );

    const folder = new grafana.oss.Folder(
      `${name}-folder`,
      { title: name },
      { parent: this },
    );

    const dashboardConfigs = (args.dashboardBuilders ?? []).map(factory =>
      factory(this.connections),
    );

    this.dashboards = dashboardConfigs.map((config, i) =>
      config.createResource(`${name}-dashboard-${i}`, folder, {
        parent: folder,
      }),
    );

    this.registerOutputs();
  }
}
