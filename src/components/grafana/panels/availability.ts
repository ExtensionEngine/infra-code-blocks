import * as pulumi from '@pulumi/pulumi';
import { queries as promQ } from '../../prometheus';
import { Panel } from './types';
import { createStatPercentagePanel, createBurnRatePanel } from './helpers';

export function createAvailabilityPanel(config: {
  target: number;
  window: promQ.TimeRange;
  ampNamespace: string;
  dataSourceName: pulumi.Input<string>;
}): Panel {
  return createStatPercentagePanel(
    'Availability',
    { x: 0, y: 0, w: 8, h: 8 },
    config.dataSourceName,
    {
      label: 'Availability',
      query: promQ.getAvailabilityPercentageQuery(
        config.ampNamespace,
        config.window,
      ),
      thresholds: [],
    },
  );
}

export function createAvailabilityBurnRatePanel(config: {
  target: number;
  window: promQ.TimeRange;
  ampNamespace: string;
  dataSourceName: pulumi.Input<string>;
}): Panel {
  return createBurnRatePanel(
    'Availability Burn Rate',
    { x: 0, y: 8, w: 8, h: 4 },
    config.dataSourceName,
    {
      label: 'Burn Rate',
      query: promQ.getBurnRateQuery(
        promQ.getAvailabilityQuery(config.ampNamespace, '1h'),
        config.target,
      ),
      thresholds: [],
    },
  );
}
