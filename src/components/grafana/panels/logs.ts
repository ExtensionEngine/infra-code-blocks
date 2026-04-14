import { Panel } from './types';
import { createLogsPanel } from './helpers';

export function createLogsListPanel(config: {
  logGroupName: string;
  dataSourceName: string;
}): Panel {
  return createLogsPanel(
    'Logs',
    { x: 0, y: 0, w: 24, h: 10 },
    config.dataSourceName,
    config.logGroupName,
    'fields @timestamp, @message, @logStream\n| sort @timestamp desc\n| limit 20',
  );
}
