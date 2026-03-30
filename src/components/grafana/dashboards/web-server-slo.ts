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

const defaults = {
  target: 0.99,
  window: '30d' as promQ.TimeRange,
  shortWindow: '5m' as promQ.TimeRange,
  targetLatency: 250,
};

// TODO: rename to prometheusNamespace
export function createWebServerSloDashboard(config: {
  name: string;
  title: string;
  namespace: string;
  filter: string;
  target?: number;
  window?: promQ.TimeRange;
  shortWindow?: promQ.TimeRange;
  targetLatency?: number;
}): GrafanaDashboardBuilder.Dashboard {
  const argsWithDefaults = mergeWithDefaults(defaults, config);
  return new GrafanaDashboardBuilder(config.name, argsWithDefaults.title)
    .addPanel(conns => createAvailabilityPanel(conns, argsWithDefaults))
    .addPanel(conns => createAvailabilityBurnRatePanel(conns, argsWithDefaults))
    .addPanel(conns => createSuccessRatePanel(conns, argsWithDefaults))
    .addPanel(conns =>
      createSuccessRateTimeSeriesPanel(conns, argsWithDefaults),
    )
    .addPanel(conns => createSuccessRateBurnRatePanel(conns, argsWithDefaults))
    .addPanel(conns => createLatencyPanel(conns, argsWithDefaults))
    .addPanel(conns => createLatencyPercentilePanel(conns, argsWithDefaults))
    .addPanel(conns => createLatencyPercentagePanel(conns, argsWithDefaults))
    .addPanel(conns => createLatencyBurnRatePanel(conns, argsWithDefaults))
    .build();
}
