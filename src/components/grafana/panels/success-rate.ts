import * as pulumi from '@pulumi/pulumi';
import { queries as promQ } from '../../prometheus';
import { Panel } from './types';
import {
  createStatPercentagePanel,
  createTimeSeriesPercentagePanel,
  createBurnRatePanel,
} from './helpers';

export function createSuccessRatePanel(config: {
  target: number;
  window: promQ.TimeRange;
  filter: string;
  ampNamespace: string;
  dataSourceName: pulumi.Input<string>;
}): Panel {
  return createStatPercentagePanel(
    'Success Rate',
    { x: 8, y: 0, w: 8, h: 8 },
    config.dataSourceName,
    {
      label: 'Success Rate',
      query: promQ.getSuccessPercentageQuery(
        config.ampNamespace,
        config.window,
        config.filter,
      ),
      thresholds: [],
    },
  );
}

export function createSuccessRateTimeSeriesPanel(config: {
  shortWindow: promQ.TimeRange;
  filter: string;
  ampNamespace: string;
  dataSourceName: pulumi.Input<string>;
}): Panel {
  return createTimeSeriesPercentagePanel(
    'HTTP Request Success Rate',
    { x: 0, y: 16, w: 12, h: 8 },
    config.dataSourceName,
    {
      label: 'Success Rate',
      query: promQ.getSuccessPercentageQuery(
        config.ampNamespace,
        config.shortWindow,
        config.filter,
      ),
      thresholds: [],
    },
  );
}

export function createSuccessRateBurnRatePanel(config: {
  target: number;
  filter: string;
  ampNamespace: string;
  dataSourceName: pulumi.Input<string>;
}): Panel {
  return createBurnRatePanel(
    'Success Rate Burn Rate',
    { x: 8, y: 8, w: 8, h: 4 },
    config.dataSourceName,
    {
      label: 'Burn Rate',
      query: promQ.getBurnRateQuery(
        promQ.getSuccessRateQuery(config.ampNamespace, '1h', config.filter),
        config.target,
      ),
      thresholds: [],
    },
  );
}
