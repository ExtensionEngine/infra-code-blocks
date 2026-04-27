import { Panel } from './types';
import { createTablePanel, createTracesPanel } from './helpers';

export function createLogsViewPanel(config: {
  logGroupName: string;
  logsDataSourceName: string;
  tracesDataSourceName: string;
}): Panel {
  return createTablePanel(
    'Logs',
    { x: 0, y: 0, w: 24, h: 12 },
    config.logsDataSourceName,
    [
      {
        expression: `fields @Timestamp, trace_id as traceId, severity_text as logLevel, @message
          | parse @message '"body":"*"' as body
          | filter severity_text like $log_level
          | filter strcontains(@message, '$search_query')
          | sort @timestamp desc
          | limit \${limit}`,
        logGroups: [{ name: config.logGroupName }],
        queryMode: 'Logs',
      },
    ],
    [
      {
        id: 'organize',
        options: {
          renameByName: {
            body: 'Body',
            logLevel: 'Log Level',
            traceId: 'View traces',
            '@message': 'Message',
          },
          indexByName: {
            Time: 0,
            body: 1,
            logLevel: 2,
            traceId: 3,
            '@message': 4,
          },
          excludeByName: {
            Value: true,
          },
        },
      },
      {
        id: 'sortBy',
        options: {
          sort: [
            {
              field: 'Time',
              desc: true,
            },
          ],
        },
      },
    ],
    [
      {
        matcher: {
          id: 'byName',
          options: 'traceId',
        },
        properties: [
          {
            id: 'links',
            value: [
              {
                title: 'View traces',
                url: '/d/\${__dashboard.uid}/\${__dashboard}?var-traceId=\${__data.fields.traceId}',
              },
            ],
          },
          {
            id: 'custom.cellOptions',
            value: {
              type: 'data-links',
            },
          },
        ],
      },
      {
        matcher: {
          id: 'byName',
          options: '@message',
        },
        properties: [
          {
            id: 'custom.inspect',
            value: true,
          },
          {
            id: 'custom.cellOptions',
            value: {
              type: 'json-view',
            },
          },
        ],
      },
    ],
  );
}

export function createTracesViewPanel(config: {
  dataSourceName: string;
}): Panel {
  return createTracesPanel(
    'Traces',
    { x: 0, y: 0, w: 24, h: 24 },
    config.dataSourceName,
    [
      {
        query: '$traceId',
        queryType: 'getTrace',
      },
    ],
  );
}
