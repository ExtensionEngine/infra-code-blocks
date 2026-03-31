import * as pulumi from '@pulumi/pulumi';
import { mergeWithDefaults } from '../../../shared/merge-with-defaults';
import { GrafanaDashboardBuilder } from './builder';
import { queries as promQ } from '../../prometheus';
import {
  createAvailabilityPanel,
  createAvailabilityBurnRatePanel,
} from '../panels/availability';
import {
  createSuccessRatePanel,
  createSuccessRateTimeSeriesPanel,
  createSuccessRateBurnRatePanel,
} from '../panels/success-rate';
import {
  createLatencyPanel,
  createLatencyPercentilePanel,
  createLatencyPercentagePanel,
  createLatencyBurnRatePanel,
} from '../panels/latency';

export namespace WebServerSloDashboard {
  export type Args = {
    name: string;
    title: string;
    ampNamespace: string;
    filter: string;
    dataSourceName: pulumi.Input<string>;
    target?: number;
    window?: promQ.TimeRange;
    shortWindow?: promQ.TimeRange;
    targetLatency?: number;
  };
}

const defaults = {
  target: 0.99,
  window: '30d',
  shortWindow: '5m',
  targetLatency: 250,
};

export function createWebServerSloDashboard(
  config: WebServerSloDashboard.Args,
): GrafanaDashboardBuilder.CreateDashboard {
  const argsWithDefaults = mergeWithDefaults(defaults, config);
  return new GrafanaDashboardBuilder(config.name, argsWithDefaults.title)
    .addPanel(createAvailabilityPanel(argsWithDefaults))
    .addPanel(createAvailabilityBurnRatePanel(argsWithDefaults))
    .addPanel(createSuccessRatePanel(argsWithDefaults))
    .addPanel(createSuccessRateTimeSeriesPanel(argsWithDefaults))
    .addPanel(createSuccessRateBurnRatePanel(argsWithDefaults))
    .addPanel(createLatencyPanel(argsWithDefaults))
    .addPanel(createLatencyPercentilePanel(argsWithDefaults))
    .addPanel(createLatencyPercentagePanel(argsWithDefaults))
    .addPanel(createLatencyBurnRatePanel(argsWithDefaults))
    .build();
}
