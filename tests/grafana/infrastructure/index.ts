import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as studion from '@studion/infra-code-blocks';
import { getCommonVpc } from '../../util';
import {
  appImage,
  appPort,
  appName,
  prometheusNamespace,
  apiFilter,
} from './config';

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

const prometheusWorkspace = new aws.amp.Workspace(
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
    prometheusNamespace,
    prometheusWorkspace,
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

const grafanaSloDashboard =
  new studion.grafana.dashboard.WebServerSloDashboardBuilder(
    `${appName}-slo-dashboard`,
    { title: 'ICB Grafana Test SLO' },
  )
    .withAvailability(0.99, '1d', prometheusNamespace)
    .withSuccessRate(0.95, '1d', '1h', apiFilter, prometheusNamespace)
    .withLatency(0.95, 250, '1d', '1h', apiFilter, prometheusNamespace)
    .build();

const grafanaSloComponent = new studion.grafana.GrafanaBuilder(`${appName}-slo`)
  .withPrometheus({
    endpoint: prometheusWorkspace.prometheusEndpoint,
    region: aws.config.requireRegion(),
  })
  .addDashboard(grafanaSloDashboard)
  .build({ parent });

export { webServer, prometheusWorkspace, grafanaSloComponent };
