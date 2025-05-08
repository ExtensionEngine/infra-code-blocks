import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { MonitoringDashboard } from './types';

class MonitoringDashboard extends pulumi.ComponentResource {
  dashboard: pulumi.Output<grafana.oss.Dashboard>;

  constructor(
    name: string,
    args: MonitoringDashboard.Args,
    opts: pulumi.ComponentResourceOptions
  ) {
    super('studion:grafana:MonitoringDashboard', name, {}, opts);

    this.dashboard = this.createDashboard(
      name,
      pulumi.output(args.title),
      pulumi.output(args.panels),
      pulumi.output(args.provider),
      pulumi.output(args.tags)
    );

    this.registerOutputs();
  }

  createDashboard(
    name: string,
    title: pulumi.Output<string>,
    panels: pulumi.Output<MonitoringDashboard.Panel[]>,
    provider: pulumi.Output<grafana.Provider>,
    tags: pulumi.Output<string[]>
  ): pulumi.Output<grafana.oss.Dashboard> {
    return pulumi.all([
      title,
      panels,
      provider,
      tags
    ]).apply(([
      title,
      panels,
      provider,
      tags
    ]) => {
      // TODO: Turn panels into configurable components
      return new grafana.oss.Dashboard(name, {
        configJson: JSON.stringify({
          title,
          tags,
          timezone: 'browser',
          refresh: '10s',
          panels,
        })
      }, { provider });
    });
  }
}

export default MonitoringDashboard;
