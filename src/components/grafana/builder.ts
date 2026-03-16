import * as pulumi from '@pulumi/pulumi';
import { Grafana } from './grafana';

export class GrafanaBuilder {
  private name: string;
  private prometheusConfig?: Grafana.PrometheusConfig;
  private tags?: Grafana.Args['tags'];

  constructor(name: string) {
    this.name = name;
  }

  public withPrometheus(config: Grafana.PrometheusConfig): this {
    this.prometheusConfig = config;

    return this;
  }

  public withTags(tags: Grafana.Args['tags']): this {
    this.tags = tags;

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    return new Grafana(
      this.name,
      {
        prometheus: this.prometheusConfig,
        tags: this.tags,
      },
      opts,
    );
  }
}
