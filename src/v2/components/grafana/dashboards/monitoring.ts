import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { WithInput } from '../../../../types/pulumi';

// TODO: Should we prefix all namespaces with `Studion`
export namespace Grafana.MonitoringDashboard {
  // TODO: Create SLO abstraction that enables configuring:
  // - panels (long-window SLI, long-window error budget)
  // - alerts (long-window burn, short-window burn)
  export type Metric = {
    organicAvailability: { query: string },
    totalAvailability: { query: string },
    organicSuccessRate: { query: string },
    totalSuccessRate: { query: string },
    percentileLatency: { query: string },
    latencyBelowThreshold: { query: string },
  };

  export type Args = {
    title: pulumi.Input<string>;
    metrics: WithInput<Metric>;
    dataSource: pulumi.Input<string>;
    provider: pulumi.Input<grafana.Provider>;
    tags: pulumi.Input<pulumi.Input<string>[]>;
  };
}

class MonitoringDashboard extends pulumi.ComponentResource {
  dashboard: pulumi.Output<grafana.oss.Dashboard>;

  constructor(
    name: string,
    args: Grafana.MonitoringDashboard.Args,
    opts: pulumi.ComponentResourceOptions
  ) {
    super('studion:grafana:MonitoringDashboard', name, {}, opts);

    this.dashboard = this.createDashboard(
      name,
      pulumi.output(args.title),
      pulumi.output(args.metrics),
      pulumi.output(args.dataSource),
      pulumi.output(args.provider),
      pulumi.output(args.tags)
    );

    this.registerOutputs();
  }

  createDashboard(
    name: string,
    title: pulumi.Output<string>,
    metrics: pulumi.Output<Grafana.MonitoringDashboard.Metric>,
    dataSource: pulumi.Output<string>,
    provider: pulumi.Output<grafana.Provider>,
    tags: pulumi.Output<string[]>
  ): pulumi.Output<grafana.oss.Dashboard> {
    return pulumi.all([
      title,
      metrics,
      dataSource,
      provider,
      tags
    ]).apply(([
      title,
      metrics,
      dataSource,
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
          panels: [{
            title: 'Organic Availability',
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            type: 'stat',
            datasource: dataSource,
            targets: [{
              expr: metrics.organicAvailability.query,
              legendFormat: 'Uptime %',
              refId: 'A'
            }],
            fieldConfig: {
              defaults: {
                color: { mode: 'thresholds' },
                thresholds: {
                  mode: 'absolute',
                  steps: [
                    { color: 'red', value: null },
                    { color: 'yellow', value: 98 },
                    { color: 'green', value: 99 }
                  ]
                },
                unit: 'percent',
                min: 0,
                max: 100
              }
            },
            options: {
              colorMode: 'value',
              graphMode: 'area',
              justifyMode: 'auto',
              textMode: 'auto',
              reduceOptions: {
                calcs: ['mean'],
                fields: ''
              }
            }
          }, {
            title: 'Total Availability',
            gridPos: { h: 8, w: 12, x: 12, y: 0 },
            type: 'stat',
            datasource: dataSource,
            targets: [{
              expr: metrics.totalAvailability.query,
              legendFormat: 'Uptime %',
              refId: 'A'
            }],
            fieldConfig: {
              defaults: {
                color: { mode: 'thresholds' },
                thresholds: {
                  mode: 'absolute',
                  steps: [
                    { color: 'red', value: null },
                    { color: 'yellow', value: 98 },
                    { color: 'green', value: 99 }
                  ]
                },
                unit: 'percent',
                min: 0,
                max: 100
              }
            },
            options: {
              colorMode: 'value',
              graphMode: 'area',
              justifyMode: 'auto',
              textMode: 'auto',
              reduceOptions: {
                calcs: ['mean'],
                fields: ''
              }
            }
          }, {
            title: 'Organic HTTP Request Success Rate',
            type: 'timeseries',
            datasource: dataSource,
            gridPos: { x: 0, y: 8, w: 12, h: 8 },
            targets: [{
              expr: metrics.organicSuccessRate.query,
              legendFormat: 'Success Rate %',
              refId: 'A'
            }],
            fieldConfig: {
              defaults: {
                unit: 'percent',
                min: 0,
                max: 100
              }
            },
          }, {
            title: 'Total HTTP Request Success Rate',
            type: 'timeseries',
            datasource: dataSource,
            gridPos: { x: 12, y: 8, w: 12, h: 8 },
            targets: [{
              expr: metrics.totalSuccessRate.query,
              legendFormat: 'Success Rate %',
              refId: 'A'
            }],
            fieldConfig: {
              defaults: {
                unit: 'percent',
                min: 0,
                max: 100
              }
            },
          }, {
            title: 'API Latency',
            type: 'timeseries',
            datasource: dataSource,
            gridPos: { x: 0, y: 16, w: 12, h: 8 },
            targets: [{
              expr: metrics.percentileLatency.query,
              legendFormat: 'p99 Latency (ms)',
              refId: 'A'
            }],
            fieldConfig: {
              defaults: {
                color: { mode: 'thresholds' },
                thresholds: {
                  mode: 'absolute',
                  steps: [
                    { color: 'green', value: null },
                    { color: 'yellow', value: 400 },
                    { color: 'red', value: 500 }
                  ]
                },
                unit: 'ms',
                custom: {
                  lineInterpolation: 'smooth',
                  spanNulls: true
                }
              }
            }
          },
          {
            title: 'Requests Under 500ms SLO',
            type: 'timeseries',
            datasource: dataSource,
            gridPos: { x: 12, y: 16, w: 12, h: 8 },
            targets: [{
              expr: metrics.latencyBelowThreshold.query,
              legendFormat: 'Requests < 500ms (%)',
              refId: 'A'
            }],
            fieldConfig: {
              defaults: {
                color: { mode: 'thresholds' },
                thresholds: {
                  mode: 'absolute',
                  steps: [
                    { color: 'green', value: null },
                    { color: 'yellow', value: 400 },
                    { color: 'red', value: 500 }
                  ]
                },
                unit: 'percent',
                min: 0,
                max: 100
              }
            }
          }],
        })
      }, { provider });
    });
  }
}

export default MonitoringDashboard;
