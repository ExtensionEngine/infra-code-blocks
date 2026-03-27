import { queries as promQ } from '../../prometheus';
import { GrafanaConnection, AMPConnection } from '../connections';
import { Panel } from './types';
import {
  createStatPercentagePanel,
  createBurnRatePanel,
  requireConnection,
} from './helpers';

export function createAvailabilityPanel(
  connections: GrafanaConnection[],
  config: { target: number; window: promQ.TimeRange; namespace: string },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createStatPercentagePanel(
    'Availability',
    { x: 0, y: 0, w: 8, h: 8 },
    ds,
    {
      label: 'Availability',
      query: promQ.getAvailabilityPercentageQuery(
        config.namespace,
        config.window,
      ),
      thresholds: [],
    },
  );
}

export function createAvailabilityBurnRatePanel(
  connections: GrafanaConnection[],
  config: { target: number; window: promQ.TimeRange; namespace: string },
): Panel {
  const ds = requireConnection(connections, AMPConnection).dataSource.name;
  return createBurnRatePanel(
    'Availability Burn Rate',
    { x: 0, y: 8, w: 8, h: 4 },
    ds,
    {
      label: 'Burn Rate',
      query: promQ.getBurnRateQuery(
        promQ.getAvailabilityQuery(config.namespace, '1h'),
        config.target,
      ),
      thresholds: [],
    },
  );
}
