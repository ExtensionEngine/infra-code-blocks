import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaDashboard } from './dashboards/types';
import { GrafanaConnection } from './connections';

export namespace Grafana {
  export type Args = {
    connections: GrafanaConnection[];
    dashboards?: GrafanaDashboard.DashboardConfig[];
  };
}

export class Grafana extends pulumi.ComponentResource {
  name: string;
  readonly connections: GrafanaConnection[];
  dashboards: grafana.oss.Dashboard[] = [];

  constructor(
    name: string,
    args: Grafana.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:Grafana', name, {}, opts);

    this.name = name;
    this.connections = args.connections;

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
