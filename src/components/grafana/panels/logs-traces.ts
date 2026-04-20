import { Panel } from './types';
import { createTablePanel } from './helpers';

export function createLogsViewPanel(config: {
  logGroupName: string;
  dataSourceName: string;
}): Panel {
  return createTablePanel(
    'Logs',
    { x: 0, y: 0, w: 24, h: 12 },
    config.dataSourceName,
    [
      {
        expression: `fields @Timestamp, trace_id as traceId
          | parse @message '"body":"*"' as body
          | parse @message '"res":{"statusCode":*}' as statusCode
          | parse @message '"severity_text":"*"' as logLevel
          | filter body like /\${search_text}/
          | filter \${status_code}
          | filter \${log_level}
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
            statusCode: 'Status Code',
            logLevel: 'Log Level',
            body: 'Body',
            '@timestamp': 'Timestamp',
            traceId: 'Trace Id',
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
            id: 'displayName',
            value: 'Traces',
          },
          {
            id: 'links',
            value: [
              {
                title: 'Open traces',
                url: `/d/\${__dashboard.uid}/\${__dashboard}?var-traceId=\${__data.fields.traceId}`,
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
    ],
  );
}

export function createTracesViewPanel(config: {
  dataSourceName: string;
}): Panel {
  return createTablePanel(
    'Traces',
    { x: 0, y: 0, w: 24, h: 12 },
    config.dataSourceName,
    [
      {
        query: '$traceId',
        queryType: 'getTrace',
      },
    ],
  );
}
