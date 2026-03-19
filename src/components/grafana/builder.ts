import * as pulumi from '@pulumi/pulumi';
import { GrafanaConnection } from './connections';
import { Grafana } from './grafana';
import { GrafanaDashboard } from './dashboards/types';

export class GrafanaBuilder {
  private name: string;
  private connections: GrafanaConnection[] = [];
  private dashboardConfigs: GrafanaDashboard.DashboardConfig[] = [];

  constructor(name: string) {
    this.name = name;
  }

  public addConnection(connection: GrafanaConnection): this {
    this.connections.push(connection);

    return this;
  }

  public addDashboard(config: GrafanaDashboard.DashboardConfig): this {
    this.dashboardConfigs.push(config);

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    if (!this.connections.length) {
      throw new Error(
        'At least one connection is required. Call addConnection() before build().',
      );
    }

    return new Grafana(
      this.name,
      {
        connections: this.connections,
        dashboards: this.dashboardConfigs,
      },
      opts,
    );
  }
}
