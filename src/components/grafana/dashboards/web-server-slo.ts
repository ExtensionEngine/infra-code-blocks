import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { queries as promQ } from '../../prometheus';
import { Grafana } from './types';
import {
  createBurnRatePanel,
  createStatPercentagePanel,
  createTimeSeriesPanel,
  createTimeSeriesPercentagePanel,
} from './panels';

class WebServerSloDashboardBuilder {
  name: string;
  title: pulumi.Output<string>;
  panels: Grafana.Panel[] = [];
  tags?: pulumi.Output<string[]>;

  constructor(name: string, args: Grafana.Args) {
    this.name = name;
    this.title = pulumi.output(args.title);
  }

  withAvailability(
    target: number,
    window: promQ.TimeRange,
    dataSource: string,
    prometheusNamespace: string,
  ): this {
    const availabilityPercentage = promQ.getAvailabilityPercentageQuery(
      prometheusNamespace,
      window,
    );
    const availabilityBurnRate = promQ.getBurnRateQuery(
      promQ.getAvailabilityQuery(prometheusNamespace, '1h'),
      target,
    );

    const availabilitySloPanel = createStatPercentagePanel(
      'Availability',
      { x: 0, y: 0, w: 8, h: 8 },
      dataSource,
      {
        label: 'Availability',
        query: availabilityPercentage,
        thresholds: [],
      },
    );
    const availabilityBurnRatePanel = createBurnRatePanel(
      'Availability Burn Rate',
      { x: 0, y: 8, w: 8, h: 4 },
      dataSource,
      {
        label: 'Burn Rate',
        query: availabilityBurnRate,
        thresholds: [],
      },
    );

    this.panels.push(availabilitySloPanel, availabilityBurnRatePanel);

    return this;
  }

  withSuccessRate(
    target: number,
    window: promQ.TimeRange,
    shortWindow: promQ.TimeRange,
    filter: string,
    dataSource: string,
    prometheusNamespace: string,
  ): this {
    const successRateSlo = promQ.getSuccessPercentageQuery(
      prometheusNamespace,
      window,
      filter,
    );
    const successRateBurnRate = promQ.getBurnRateQuery(
      promQ.getSuccessRateQuery(prometheusNamespace, '1h', filter),
      target,
    );
    const successRate = promQ.getSuccessPercentageQuery(
      prometheusNamespace,
      shortWindow,
      filter,
    );

    const successRateSloPanel = createStatPercentagePanel(
      'Success Rate',
      { x: 8, y: 0, w: 8, h: 8 },
      dataSource,
      {
        label: 'Success Rate',
        query: successRateSlo,
        thresholds: [],
      },
    );
    const successRatePanel = createTimeSeriesPercentagePanel(
      'HTTP Request Success Rate',
      { x: 0, y: 16, w: 12, h: 8 },
      dataSource,
      {
        label: 'Success Rate',
        query: successRate,
        thresholds: [],
      },
    );
    const successRateBurnRatePanel = createBurnRatePanel(
      'Success Rate Burn Rate',
      { x: 8, y: 8, w: 8, h: 4 },
      dataSource,
      {
        label: 'Burn Rate',
        query: successRateBurnRate,
        thresholds: [],
      },
    );

    this.panels.push(
      successRateSloPanel,
      successRatePanel,
      successRateBurnRatePanel,
    );

    return this;
  }

  withLatency(
    target: number,
    targetLatency: number,
    window: promQ.TimeRange,
    shortWindow: promQ.TimeRange,
    filter: string,
    dataSource: string,
    prometheusNamespace: string,
  ): this {
    const latencySlo = promQ.getLatencyPercentageQuery(
      prometheusNamespace,
      window,
      targetLatency,
      filter,
    );
    const latencyBurnRate = promQ.getBurnRateQuery(
      promQ.getLatencyRateQuery(prometheusNamespace, '1h', targetLatency),
      target,
    );
    const percentileLatency = promQ.getPercentileLatencyQuery(
      prometheusNamespace,
      shortWindow,
      target,
      filter,
    );
    const latencyBelowThreshold = promQ.getLatencyPercentageQuery(
      prometheusNamespace,
      shortWindow,
      targetLatency,
      filter,
    );

    const latencySloPanel = createStatPercentagePanel(
      'Request % below 250ms',
      { x: 16, y: 0, w: 8, h: 8 },
      dataSource,
      {
        label: 'Request % below 250ms',
        query: latencySlo,
        thresholds: [],
      },
    );
    const percentileLatencyPanel = createTimeSeriesPanel(
      '99th Percentile Latency',
      { x: 12, y: 16, w: 12, h: 8 },
      dataSource,
      {
        label: '99th Percentile Latency',
        query: percentileLatency,
        thresholds: [],
      },
      'ms',
    );
    const latencyPercentagePanel = createTimeSeriesPercentagePanel(
      'Request percentage below 250ms',
      { x: 0, y: 24, w: 12, h: 8 },
      dataSource,
      {
        label: 'Request percentage below 250ms',
        query: latencyBelowThreshold,
        thresholds: [],
      },
    );
    const latencyBurnRatePanel = createBurnRatePanel(
      'Latency Burn Rate',
      { x: 16, y: 8, w: 8, h: 4 },
      dataSource,
      {
        label: 'Burn Rate',
        query: latencyBurnRate,
        thresholds: [],
      },
    );

    this.panels.push(
      latencySloPanel,
      percentileLatencyPanel,
      latencyPercentagePanel,
      latencyBurnRatePanel,
    );

    return this;
  }

  build(
    provider: pulumi.Output<grafana.Provider>,
  ): pulumi.Output<grafana.oss.Dashboard> {
    return pulumi
      .all([this.title, this.panels, provider, this.tags])
      .apply(([title, panels, provider, tags]) => {
        return new grafana.oss.Dashboard(
          this.name,
          {
            configJson: JSON.stringify({
              title,
              tags,
              timezone: 'browser',
              refresh: '10s',
              panels,
            }),
          },
          { provider },
        );
      });
  }
}

export default WebServerSloDashboardBuilder;
