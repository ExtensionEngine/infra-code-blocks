import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as studion from '@studion/infra-code-blocks';
import { getCommonVpc } from '../../util';
import { appImage, appPort, appName, ampNamespace, apiFilter } from './config';

const stackName = pulumi.getStack();
const parent = new pulumi.ComponentResource(
  'studion:grafana:TestGroup',
  `${appName}-root`,
);
const tags = {
  Env: stackName,
  Project: appName,
};

const vpc = getCommonVpc();

const cluster = new aws.ecs.Cluster(`${appName}-cluster`, { tags }, { parent });

const ampWorkspace = new aws.amp.Workspace(
  `${appName}-workspace`,
  { tags },
  { parent },
);

const cloudWatchLogGroup = new aws.cloudwatch.LogGroup(
  `${appName}-log-group`,
  {
    name: `/grafana/test/${appName}-${stackName}`,
    tags,
  },
  { parent },
);

const otelCollector = new studion.openTelemetry.OtelCollectorBuilder(
  appName,
  stackName,
)
  .withDefault({
    prometheusNamespace: ampNamespace,
    prometheusWorkspace: ampWorkspace,
    region: aws.config.requireRegion(),
    logGroup: cloudWatchLogGroup,
    logStreamName: `${appName}-stream`,
  })
  .build();

const ecs = {
  cluster,
  desiredCount: 1,
  size: 'small' as const,
  autoscaling: { enabled: false },
};

const webServer = new studion.WebServerBuilder(appName)
  .withContainer(appImage, appPort, {
    environment: [
      { name: 'OTEL_SERVICE_NAME', value: appName },
      { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', value: 'http://127.0.0.1:4318' },
      { name: 'OTEL_EXPORTER_OTLP_PROTOCOL', value: 'http/json' },
    ],
  })
  .withEcsConfig(ecs)
  .withVpc(vpc.vpc)
  .withOtelCollector(otelCollector)
  .build({ parent });

const awsAccountId = process.env.GRAFANA_AWS_ACCOUNT_ID!;

const ampDataSourceName = `${appName}-amp-datasource`;
const ampGrafana = new studion.grafana.GrafanaBuilder(`${appName}-amp`)
  .addAmp(`${appName}-slo-amp`, {
    awsAccountId,
    endpoint: ampWorkspace.prometheusEndpoint,
    region: aws.config.requireRegion(),
    dataSourceName: ampDataSourceName,
  })
  .addSloDashboard({
    name: `${appName}-slo-dashboard`,
    title: 'ICB Grafana Test SLO',
    ampNamespace: ampNamespace,
    filter: apiFilter,
    dataSourceName: ampDataSourceName,
    target: 0.99,
    window: '1d',
    shortWindow: '1h',
    targetLatency: 250,
  })
  .build({ parent });

const configurableAmpDataSourceName = `${appName}-configurable-amp-datasource`;
const configurableGrafana = new studion.grafana.GrafanaBuilder(
  `${appName}-configurable`,
)
  .withFolderName('ICB Configurable Test Folder')
  .addConnection(
    opts =>
      new studion.grafana.AMPConnection(
        `${appName}-cfg-amp`,
        {
          awsAccountId,
          endpoint: ampWorkspace.prometheusEndpoint,
          region: aws.config.requireRegion(),
          dataSourceName: configurableAmpDataSourceName,
          installPlugin: false,
        },
        opts,
      ),
  )
  .addDashboard(
    new studion.grafana.dashboard.DashboardBuilder(
      `${appName}-configurable-dashboard`,
    )
      .withTitle('ICB Grafana Configurable Dashboard')
      .addPanel({
        title: 'AMP Requests',
        type: 'stat',
        datasource: configurableAmpDataSourceName,
        gridPos: { x: 0, y: 0, w: 8, h: 8 },
        targets: [
          {
            expr: `${ampNamespace}_http_requests_total`,
            legendFormat: 'requests',
          },
        ],
        fieldConfig: { defaults: {} },
      })
      .build(),
  )
  .build({ parent });

export { webServer, ampWorkspace, ampGrafana, configurableGrafana };
