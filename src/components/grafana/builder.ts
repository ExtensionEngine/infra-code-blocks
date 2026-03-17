import * as pulumi from '@pulumi/pulumi';
import { Grafana } from './grafana';

export class GrafanaBuilder {
  private name: string;
  private prometheusConfig?: Grafana.PrometheusConfig;

  constructor(name: string) {
    this.name = name;
  }

  public withPrometheus(config: Grafana.PrometheusConfig): this {
    this.prometheusConfig = config;

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    return new Grafana(
      this.name,
      {
        prometheus: this.prometheusConfig,
      },
      opts,
    );
  }
}
