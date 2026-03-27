import { queries as promQ } from '../../prometheus';
import { GrafanaConnection, AMPConnection } from '../connections';
import { Panel } from './types';
import {
  createStatPercentagePanel,
  createTimeSeriesPercentagePanel,
  createBurnRatePanel,
  requireConnection,
} from './helpers';

export function createSuccessRatePanel(
  connections: GrafanaConnection[],
  config: {
    target: number;
    window: promQ.TimeRange;
    filter: string;
    namespace: string;
  },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createStatPercentagePanel(
    'Success Rate',
    { x: 8, y: 0, w: 8, h: 8 },
    ds,
    {
      label: 'Success Rate',
      query: promQ.getSuccessPercentageQuery(
        config.namespace,
        config.window,
        config.filter,
      ),
      thresholds: [],
    },
  );
}

export function createSuccessRateTimeSeriesPanel(
  connections: GrafanaConnection[],
  config: { shortWindow: promQ.TimeRange; filter: string; namespace: string },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createTimeSeriesPercentagePanel(
    'HTTP Request Success Rate',
    { x: 0, y: 16, w: 12, h: 8 },
    ds,
    {
      label: 'Success Rate',
      query: promQ.getSuccessPercentageQuery(
        config.namespace,
        config.shortWindow,
        config.filter,
      ),
      thresholds: [],
    },
  );
}

export function createSuccessRateBurnRatePanel(
  connections: GrafanaConnection[],
  config: { target: number; filter: string; namespace: string },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createBurnRatePanel(
    'Success Rate Burn Rate',
    { x: 8, y: 8, w: 8, h: 4 },
    ds,
    {
      label: 'Burn Rate',
      query: promQ.getBurnRateQuery(
        promQ.getSuccessRateQuery(config.namespace, '1h', config.filter),
        config.target,
      ),
      thresholds: [],
    },
  );
}
