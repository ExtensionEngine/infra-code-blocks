import * as pulumi from '@pulumi/pulumi';
import { AMPConnection, GrafanaConnection } from './connections';
import { Grafana } from './grafana';
import { GrafanaDashboard } from './dashboards/types';

export class GrafanaBuilder {
  private readonly name: string;
  private readonly connectionBuilders: GrafanaConnection.ConnectionBuilder[] =
    [];
  private readonly dashboardBuilders: GrafanaDashboard.DashboardBuilder[] = [];

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

  public addDashboard(builder: GrafanaDashboard.DashboardBuilder): this {
    this.dashboardBuilders.push(builder);

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    if (!this.connectionBuilders.length) {
      throw new Error(
        'At least one connection is required. Call addConnection()  to add custom connection or use one of existing connection builders.',
      );
    }

    return new Grafana(
      this.name,
      {
        connectionBuilders: this.connectionBuilders,
        dashboardBuilders: this.dashboardBuilders,
      },
      opts,
    );
  }
}
