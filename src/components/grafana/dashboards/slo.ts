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

export namespace SloDashboard {
  export type Args = {
    name: string;
    title: string;
    ampNamespace: string;
    filter: string;
    dataSourceName: string;
    target?: number;
    window?: promQ.TimeRange;
    shortWindow?: promQ.TimeRange;
    targetLatency?: number;
    dashboardConfig?: GrafanaDashboardBuilder.Config;
  };
}

const defaults = {
  target: 0.99,
  window: '30d',
  shortWindow: '5m',
  targetLatency: 250,
  dashboardConfig: {},
};

export function createSloDashboard(
  config: SloDashboard.Args,
): GrafanaDashboardBuilder.CreateDashboard {
  const argsWithDefaults = mergeWithDefaults(defaults, config);
  const {
    target,
    window,
    shortWindow,
    targetLatency,
    ampNamespace,
    dataSourceName,
    filter,
  } = argsWithDefaults;

  return new GrafanaDashboardBuilder(config.name)
    .withConfig(argsWithDefaults.dashboardConfig)
    .withTitle(argsWithDefaults.title)
    .addPanel(
      createAvailabilityPanel({ target, window, ampNamespace, dataSourceName }),
    )
    .addPanel(
      createAvailabilityBurnRatePanel({
        target,
        window,
        ampNamespace,
        dataSourceName,
      }),
    )
    .addPanel(
      createSuccessRatePanel({
        target,
        window,
        filter,
        ampNamespace,
        dataSourceName,
      }),
    )
    .addPanel(
      createSuccessRateTimeSeriesPanel({
        shortWindow,
        filter,
        ampNamespace,
        dataSourceName,
      }),
    )
    .addPanel(
      createSuccessRateBurnRatePanel({
        target,
        filter,
        ampNamespace,
        dataSourceName,
      }),
    )
    .addPanel(
      createLatencyPanel({
        target,
        window,
        targetLatency,
        filter,
        ampNamespace,
        dataSourceName,
      }),
    )
    .addPanel(
      createLatencyPercentilePanel({
        target,
        shortWindow,
        filter,
        ampNamespace,
        dataSourceName,
      }),
    )
    .addPanel(
      createLatencyPercentagePanel({
        targetLatency,
        shortWindow,
        filter,
        ampNamespace,
        dataSourceName,
      }),
    )
    .addPanel(
      createLatencyBurnRatePanel({
        target,
        targetLatency,
        ampNamespace,
        dataSourceName,
      }),
    )
    .build();
}
