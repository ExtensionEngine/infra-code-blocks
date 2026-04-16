import { Panel } from './types';
import {
  createLogsPanel,
  createTablePanel,
  createTableForLogsPanel,
} from './helpers';

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

export function createLogsListWithFiltersPanel(config: {
  logGroupName: string;
  dataSourceName: string;
}): Panel {
  return createTableForLogsPanel(
    'Logs',
    { x: 0, y: 0, w: 24, h: 12 },
    config.dataSourceName,
    config.logGroupName,
    `fields @timestamp\n| parse @message '"body":"*"' as body\n| parse @message '"res":{"statusCode":*}' as statusCode\n| parse @message '"severity_text":"*"' as logLevel\n| filter \${status_code}\n| filter \${log_level}\n| sort @timestamp desc\n| limit 20`,
    {
      id: 'organize',
      options: {
        renameByName: {
          statusCode: 'Status Code',
          logLevel: 'Log Level',
          body: 'Body',
          '@timestamp': 'Timestamp',
        },
        indexByName: {
          '@timestamp': 0,
          statusCode: 1,
          logLevel: 2,
          body: 3,
        },
        excludeByName: {
          Value: true,
        },
      },
    },
  );
}
