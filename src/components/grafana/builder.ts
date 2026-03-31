import * as pulumi from '@pulumi/pulumi';
import {
  AMPConnection,
  CloudWatchLogsConnection,
  GrafanaConnection,
  XRayConnection,
} from './connections';
import { Grafana } from './grafana';
import type { GrafanaDashboardBuilder } from './dashboards/builder';

export class GrafanaBuilder {
  private readonly name: string;
  private readonly connectionBuilders: GrafanaConnection.CreateConnection[] =
    [];
  private readonly dashboardBuilders: GrafanaDashboardBuilder.CreateDashboard[] =
    [];

  constructor(name: string) {
    this.name = name;
  }

  public addAmp(name: string, args: AMPConnection.Args): this {
    this.connectionBuilders.push(opts => new AMPConnection(name, args, opts));

    return this;
  }

  public addCLoudWatchLogs(
    name: string,
    args: CloudWatchLogsConnection.Args,
  ): this {
    this.connectionBuilders.push(
      opts => new CloudWatchLogsConnection(name, args, opts),
    );

    return this;
  }

  public addXRay(name: string, args: XRayConnection.Args): this {
    this.connectionBuilders.push(opts => new XRayConnection(name, args, opts));

    return this;
  }

  public addConnection(builder: GrafanaConnection.CreateConnection): this {
    this.connectionBuilders.push(builder);

    return this;
  }

  public addDashboard(
    dashboard: GrafanaDashboardBuilder.CreateDashboard,
  ): this {
    this.dashboardBuilders.push(dashboard);

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    if (!this.connectionBuilders.length) {
      throw new Error(
        'At least one connection is required. Call addConnection() to add custom connection or use one of existing connection builders.',
      );
    }

    if (!this.dashboardBuilders.length) {
      throw new Error(
        'At least one dashboard is required. Call addDashboard() to add a dashboard.',
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
