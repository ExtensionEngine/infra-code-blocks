import { queries as promQ } from '../../prometheus';
import { GrafanaConnection, AMPConnection } from '../connections';
import { Panel } from './types';
import {
  createStatPercentagePanel,
  createTimeSeriesPanel,
  createTimeSeriesPercentagePanel,
  createBurnRatePanel,
  requireConnection,
} from './helpers';

export function createLatencyPanel(
  connections: GrafanaConnection[],
  config: {
    target: number;
    window: promQ.TimeRange;
    targetLatency: number;
    filter: string;
    namespace: string;
  },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createStatPercentagePanel(
    'Request % below 250ms',
    { x: 16, y: 0, w: 8, h: 8 },
    ds,
    {
      label: 'Request % below 250ms',
      query: promQ.getLatencyPercentageQuery(
        config.namespace,
        config.window,
        config.targetLatency,
        config.filter,
      ),
      thresholds: [],
    },
  );
}

export function createLatencyPercentilePanel(
  connections: GrafanaConnection[],
  config: {
    target: number;
    shortWindow: promQ.TimeRange;
    filter: string;
    namespace: string;
  },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createTimeSeriesPanel(
    '99th Percentile Latency',
    { x: 12, y: 16, w: 12, h: 8 },
    ds,
    {
      label: '99th Percentile Latency',
      query: promQ.getPercentileLatencyQuery(
        config.namespace,
        config.shortWindow,
        config.target,
        config.filter,
      ),
      thresholds: [],
    },
    'ms',
  );
}

export function createLatencyPercentagePanel(
  connections: GrafanaConnection[],
  config: {
    targetLatency: number;
    shortWindow: promQ.TimeRange;
    filter: string;
    namespace: string;
  },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createTimeSeriesPercentagePanel(
    'Request percentage below 250ms',
    { x: 0, y: 24, w: 12, h: 8 },
    ds,
    {
      label: 'Request percentage below 250ms',
      query: promQ.getLatencyPercentageQuery(
        config.namespace,
        config.shortWindow,
        config.targetLatency,
        config.filter,
      ),
      thresholds: [],
    },
  );
}

export function createLatencyBurnRatePanel(
  connections: GrafanaConnection[],
  config: { target: number; targetLatency: number; namespace: string },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createBurnRatePanel(
    'Latency Burn Rate',
    { x: 16, y: 8, w: 8, h: 4 },
    ds,
    {
      label: 'Burn Rate',
      query: promQ.getBurnRateQuery(
        promQ.getLatencyRateQuery(config.namespace, '1h', config.targetLatency),
        config.target,
      ),
      thresholds: [],
    },
  );
}
