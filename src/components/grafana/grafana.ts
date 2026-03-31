import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import type { GrafanaDashboardBuilder } from './dashboards/builder';
import { GrafanaConnection } from './connections';

export namespace Grafana {
  export type Args = {
    connectionBuilders: GrafanaConnection.CreateConnection[];
    dashboardBuilders: GrafanaDashboardBuilder.CreateDashboard[];
    folderName?: string;
  };
}

export class Grafana extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly connections: GrafanaConnection[];
  public readonly folder: grafana.oss.Folder;
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

    this.folder = new grafana.oss.Folder(
      `${this.name}-folder`,
      { title: args.folderName ?? `${this.name}-ICB-GENERATED` },
      { parent: this },
    );

    this.dashboards = args.dashboardBuilders.map(build => {
      return build(this.connections, this.folder, { parent: this.folder });
    });

    this.registerOutputs();
  }
}
