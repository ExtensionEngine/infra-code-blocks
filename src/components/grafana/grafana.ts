import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaDashboard } from './dashboards/types';
import { GrafanaConnection } from './connections';

export namespace Grafana {
  export type Args = {
    connectionBuilders: GrafanaConnection.ConnectionBuilder[];
    dashboards?: GrafanaDashboard.DashboardConfig[];
  };
}

export class Grafana extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly connections: GrafanaConnection[];
  dashboards: grafana.oss.Dashboard[] = [];

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

    // if (args.dashboards?.length) {
    //   const dataSources = {
    //     prometheus: this.prometheusDataSource?.name,
    //   };
    //   this.dashboards = args.dashboards.map(dashboard => {
    //     return dashboard.createResource(dataSources);
    //   });
    // }

    this.registerOutputs();
  }
}
