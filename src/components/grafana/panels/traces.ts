import { Panel } from './types';
import { createTablePanel } from './helpers';

export function createTracesListPanel(config: {
  dataSourceName: string;
}): Panel {
  return createTablePanel(
    'Traces',
    { x: 0, y: 0, w: 24, h: 10 },
    config.dataSourceName,
    'getTraceSummaries',
  );
}
