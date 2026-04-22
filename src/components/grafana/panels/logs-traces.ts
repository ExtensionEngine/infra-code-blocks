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
    { x: 0, y: 0, w: 24, h: 48 },
    config.dataSourceName,
    [
      {
        query: '$traceId',
        queryType: 'getTrace',
      },
    ],
  );
}
