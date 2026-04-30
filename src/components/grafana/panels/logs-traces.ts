import * as pulumi from '@pulumi/pulumi';
import { Panel } from './types';
import { createTablePanel, createTracesPanel } from './helpers';

const expression = `
  fields @Timestamp, trace_id as traceId, severity_text as logLevel, @message
  | parse @message '"body":"*"' as body
  | filter logLevel like $log_level
  | filter strcontains(@message, '$search')
  | sort @timestamp desc
  | limit \${limit}`;

const renameTransformation = {
  body: 'Body',
  logLevel: 'Log Level',
  traceId: 'View traces',
  '@message': 'Message',
};

const orderTransformation = {
  Time: 0,
  body: 1,
  logLevel: 2,
  traceId: 3,
  '@message': 4,
};

const sortTransformation = {
  field: 'Time',
  desc: true,
};

const excludeTransformation = {
  Value: true,
};

const traceIdOverrides = [
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
];

const messageOverrides = [
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
];

export function createLogsViewPanel(config: {
  logGroupName: pulumi.Input<string>;
  logsDataSourceName: string;
  tracesDataSourceName: string;
}): Panel {
  return createTablePanel(
    'Logs',
    { x: 0, y: 0, w: 24, h: 12 },
    config.logsDataSourceName,
    [
      {
        expression,
        logGroups: [{ name: config.logGroupName }],
        queryMode: 'Logs',
      },
    ],
    [
      {
        id: 'organize',
        options: {
          renameByName: renameTransformation,
          indexByName: orderTransformation,
          excludeByName: excludeTransformation,
        },
      },
      {
        id: 'sortBy',
        options: {
          sort: [sortTransformation],
        },
      },
    ],
    [
      {
        matcher: {
          id: 'byName',
          options: 'traceId',
        },
        properties: traceIdOverrides,
      },
      {
        matcher: {
          id: 'byName',
          options: '@message',
        },
        properties: messageOverrides,
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
