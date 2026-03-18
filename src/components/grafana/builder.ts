import * as pulumi from '@pulumi/pulumi';
import { Grafana } from './grafana';
import { GrafanaDashboard } from './dashboards/types';

export class GrafanaBuilder {
  private name: string;
  private prometheusConfig?: Grafana.PrometheusConfig;
  private dashboardConfigs: GrafanaDashboard.DashboardConfig[] = [];

  constructor(name: string) {
    this.name = name;
  }

  public withPrometheus(config: Grafana.PrometheusConfig): this {
    this.prometheusConfig = config;

    return this;
  }

  public addDashboard(config: GrafanaDashboard.DashboardConfig): this {
    this.dashboardConfigs.push(config);

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    return new Grafana(
      this.name,
      {
        prometheus: this.prometheusConfig,
        dashboards: this.dashboardConfigs,
      },
      opts,
    );
  }
}
