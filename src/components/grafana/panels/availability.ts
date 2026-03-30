import { queries as promQ } from '../../prometheus';
import { AMPConnection } from '../connections';
import { PanelBuilder } from './types';
import {
  createStatPercentagePanel,
  createBurnRatePanel,
  requireConnection,
} from './helpers';

export function createAvailabilityPanel(config: {
  target: number;
  window: promQ.TimeRange;
  ampNamespace: string;
}): PanelBuilder {
  return connections => {
    const ds = requireConnection(connections, AMPConnection).dataSource.name;
    return createStatPercentagePanel(
      'Availability',
      { x: 0, y: 0, w: 8, h: 8 },
      ds,
      {
        label: 'Availability',
        query: promQ.getAvailabilityPercentageQuery(
          config.ampNamespace,
          config.window,
        ),
        thresholds: [],
      },
    );
  };
}

export function createAvailabilityBurnRatePanel(config: {
  target: number;
  window: promQ.TimeRange;
  ampNamespace: string;
}): PanelBuilder {
  return connections => {
    const ds = requireConnection(connections, AMPConnection).dataSource.name;
    return createBurnRatePanel(
      'Availability Burn Rate',
      { x: 0, y: 8, w: 8, h: 4 },
      ds,
      {
        label: 'Burn Rate',
        query: promQ.getBurnRateQuery(
          promQ.getAvailabilityQuery(config.ampNamespace, '1h'),
          config.target,
        ),
        thresholds: [],
      },
    );
  };
}
