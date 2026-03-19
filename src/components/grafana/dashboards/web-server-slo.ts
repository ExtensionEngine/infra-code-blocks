import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { queries as promQ } from '../../prometheus';
import { GrafanaDashboard } from './types';
import {
  createBurnRatePanel,
  createStatPercentagePanel,
  createTimeSeriesPanel,
  createTimeSeriesPercentagePanel,
} from './panels';

class WebServerSloDashboardBuilder {
  name: string;
  title: pulumi.Output<string>;
  private panelBuilders: ((
    dataSources: GrafanaDashboard.DataSources,
  ) => GrafanaDashboard.Panel[])[] = [];

  constructor(name: string, args: GrafanaDashboard.Args) {
    this.name = name;
    this.title = pulumi.output(args.title);
  }

  withAvailability(
    target: number,
    window: promQ.TimeRange,
    prometheusNamespace: string,
  ): this {
    this.panelBuilders.push(dataSource => {
      const prometheusDataSource = this.requireDataSource(
        dataSource,
        'prometheus',
      );
      return [
        createStatPercentagePanel(
          'Availability',
          { x: 0, y: 0, w: 8, h: 8 },
          prometheusDataSource,
          {
            label: 'Availability',
            query: promQ.getAvailabilityPercentageQuery(
              prometheusNamespace,
              window,
            ),
            thresholds: [],
          },
        ),
        createBurnRatePanel(
          'Availability Burn Rate',
          { x: 0, y: 8, w: 8, h: 4 },
          prometheusDataSource,
          {
            label: 'Burn Rate',
            query: promQ.getBurnRateQuery(
              promQ.getAvailabilityQuery(prometheusNamespace, '1h'),
              target,
            ),
            thresholds: [],
          },
        ),
      ];
    });
    return this;
  }

  withSuccessRate(
    target: number,
    window: promQ.TimeRange,
    shortWindow: promQ.TimeRange,
    filter: string,
    prometheusNamespace: string,
  ): this {
    this.panelBuilders.push(dataSource => {
      const prometheusDataSource = this.requireDataSource(
        dataSource,
        'prometheus',
      );
      return [
        createStatPercentagePanel(
          'Success Rate',
          { x: 8, y: 0, w: 8, h: 8 },
          prometheusDataSource,
          {
            label: 'Success Rate',
            query: promQ.getSuccessPercentageQuery(
              prometheusNamespace,
              window,
              filter,
            ),
            thresholds: [],
          },
        ),
        createTimeSeriesPercentagePanel(
          'HTTP Request Success Rate',
          { x: 0, y: 16, w: 12, h: 8 },
          prometheusDataSource,
          {
            label: 'Success Rate',
            query: promQ.getSuccessPercentageQuery(
              prometheusNamespace,
              shortWindow,
              filter,
            ),
            thresholds: [],
          },
        ),
        createBurnRatePanel(
          'Success Rate Burn Rate',
          { x: 8, y: 8, w: 8, h: 4 },
          prometheusDataSource,
          {
            label: 'Burn Rate',
            query: promQ.getBurnRateQuery(
              promQ.getSuccessRateQuery(prometheusNamespace, '1h', filter),
              target,
            ),
            thresholds: [],
          },
        ),
      ];
    });
    return this;
  }

  withLatency(
    target: number,
    targetLatency: number,
    window: promQ.TimeRange,
    shortWindow: promQ.TimeRange,
    filter: string,
    prometheusNamespace: string,
  ): this {
    this.panelBuilders.push(dataSource => {
      const prometheusDataSource = this.requireDataSource(
        dataSource,
        'prometheus',
      );
      return [
        createStatPercentagePanel(
          'Request % below 250ms',
          { x: 16, y: 0, w: 8, h: 8 },
          prometheusDataSource,
          {
            label: 'Request % below 250ms',
            query: promQ.getLatencyPercentageQuery(
              prometheusNamespace,
              window,
              targetLatency,
              filter,
            ),
            thresholds: [],
          },
        ),
        createTimeSeriesPanel(
          '99th Percentile Latency',
          { x: 12, y: 16, w: 12, h: 8 },
          prometheusDataSource,
          {
            label: '99th Percentile Latency',
            query: promQ.getPercentileLatencyQuery(
              prometheusNamespace,
              shortWindow,
              target,
              filter,
            ),
            thresholds: [],
          },
          'ms',
        ),
        createTimeSeriesPercentagePanel(
          'Request percentage below 250ms',
          { x: 0, y: 24, w: 12, h: 8 },
          prometheusDataSource,
          {
            label: 'Request percentage below 250ms',
            query: promQ.getLatencyPercentageQuery(
              prometheusNamespace,
              shortWindow,
              targetLatency,
              filter,
            ),
            thresholds: [],
          },
        ),
        createBurnRatePanel(
          'Latency Burn Rate',
          { x: 16, y: 8, w: 8, h: 4 },
          prometheusDataSource,
          {
            label: 'Burn Rate',
            query: promQ.getBurnRateQuery(
              promQ.getLatencyRateQuery(
                prometheusNamespace,
                '1h',
                targetLatency,
              ),
              target,
            ),
            thresholds: [],
          },
        ),
      ];
    });
    return this;
  }

  addPanel(
    buildPanel: (
      dataSource: GrafanaDashboard.DataSources,
    ) => GrafanaDashboard.Panel,
  ): this {
    this.panelBuilders.push(dataSource => [buildPanel(dataSource)]);
    return this;
  }

  build(): GrafanaDashboard.DashboardConfig {
    const { name, title, panelBuilders } = this;
    return {
      createResource(dataSources) {
        const panels = panelBuilders.flatMap(buildPanel => {
          return buildPanel(dataSources);
        });

        return new grafana.oss.Dashboard(name, {
          configJson: pulumi.jsonStringify({
            title,
            timezone: 'browser',
            refresh: '10s',
            panels,
          }),
        });
      },
    };
  }

  private requireDataSource(
    dataSource: GrafanaDashboard.DataSources,
    key: keyof GrafanaDashboard.DataSources,
  ): pulumi.Output<string> {
    if (!dataSource[key])
      throw new Error(`Missing required data source: ${String(key)}`);
    return dataSource[key]!;
  }
}

export default WebServerSloDashboardBuilder;
