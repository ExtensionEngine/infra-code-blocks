import { queries as promQ } from '../../prometheus';
import { Panel } from './types';
import {
  createStatPercentagePanel,
  createTimeSeriesPanel,
  createTimeSeriesPercentagePanel,
  createBurnRatePanel,
} from './helpers';

export function createLatencyPanel(config: {
  target: number;
  window: promQ.TimeRange;
  targetLatency: number;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel {
  return createStatPercentagePanel(
    'Request % below 250ms',
    { x: 16, y: 0, w: 8, h: 8 },
    config.dataSourceName,
    {
      label: 'Request % below 250ms',
      query: promQ.getLatencyPercentageQuery(
        config.ampNamespace,
        config.window,
        config.targetLatency,
        config.filter,
      ),
      thresholds: [],
    },
  );
}

export function createLatencyPercentilePanel(config: {
  target: number;
  shortWindow: promQ.TimeRange;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel {
  return createTimeSeriesPanel(
    '99th Percentile Latency',
    { x: 12, y: 16, w: 12, h: 8 },
    config.dataSourceName,
    {
      label: '99th Percentile Latency',
      query: promQ.getPercentileLatencyQuery(
        config.ampNamespace,
        config.shortWindow,
        config.target,
        config.filter,
      ),
      thresholds: [],
    },
    'ms',
  );
}

export function createLatencyPercentagePanel(config: {
  targetLatency: number;
  shortWindow: promQ.TimeRange;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel {
  return createTimeSeriesPercentagePanel(
    'Request percentage below 250ms',
    { x: 0, y: 24, w: 12, h: 8 },
    config.dataSourceName,
    {
      label: 'Request percentage below 250ms',
      query: promQ.getLatencyPercentageQuery(
        config.ampNamespace,
        config.shortWindow,
        config.targetLatency,
        config.filter,
      ),
      thresholds: [],
    },
  );
}

export function createLatencyBurnRatePanel(config: {
  target: number;
  targetLatency: number;
  ampNamespace: string;
  dataSourceName: string;
}): Panel {
  return createBurnRatePanel(
    'Latency Burn Rate',
    { x: 16, y: 8, w: 8, h: 4 },
    config.dataSourceName,
    {
      label: 'Burn Rate',
      query: promQ.getBurnRateQuery(
        promQ.getLatencyRateQuery(
          config.ampNamespace,
          '1h',
          config.targetLatency,
        ),
        config.target,
      ),
      thresholds: [],
    },
  );
}
