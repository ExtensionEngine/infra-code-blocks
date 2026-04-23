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
        expression: `fields @Timestamp, trace_id as traceId, trace_id as traceIdTab
          | parse @message '"body":"*"' as body
          | parse @message '"res":{"statusCode":*}' as statusCode
          | parse @message '"severity_text":"*"' as logLevel
          | parse @message '"url":"*"' as httpUrl
          | parse @message '"method":"*"' as httpMethod
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
            traceIdTab: 'Trace Id Tab',
            httpUrl: 'HTTP URL',
            httpMethod: 'HTTP Method',
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
          options: 'traceIdTab',
        },
        properties: [
          {
            id: 'displayName',
            value: 'Explore Traces',
          },
          {
            id: 'links',
            value: [
              {
                title: 'Open traces in a new tab',
                url: `/explore?left={"datasource":"${config.tracesDataSourceName}","queries":[{"queryType":"getTrace","query":"\${__data.fields.traceIdTab}"}],"range":{"from":"now-1h","to":"now"}}`,
                targetBlank: 'true',
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

export function createLogsViewPanelV2(config: {
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
        expression: `fields @Timestamp, trace_id as traceId, @message
          | parse @message '"body":"*"' as body
          | parse @message '"severity_text":"*"' as logLevel
          | parse @message '"res":{"statusCode":*}' as statusCode
          | parse @message '"url":"*"' as httpUrl
          | parse @message '"method":"*"' as httpMethod
          | filter \${log_level}
          | filter \${status_code}
          | filter \${http_method}
          | filter httpUrl like /\${http_url_query}/
          | filter @message like /\${message_query}/
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
            statusCode: 'Status Code',
            httpUrl: 'HTTP URL',
            httpMethod: 'HTTP Method',
            traceId: 'View traces',
            '@message': 'Message',
          },
          indexByName: {
            Time: 0,
            body: 1,
            logLevel: 2,
            statusCode: 3,
            httpUrl: 4,
            httpMethod: 5,
            traceId: 6,
            '@message': 7,
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
