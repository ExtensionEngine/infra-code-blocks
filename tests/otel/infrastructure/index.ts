import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as studion from '@studion/infra-code-blocks';
import { getCommonVpc } from '../../util';
import { appImage, appPort, appName, prometheusNamespace } from './config';

const stackName = pulumi.getStack();
const parent = new pulumi.ComponentResource(
  'studion:otel:TestGroup',
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

const otelCollector = new studion.openTelemetry.OtelCollectorBuilder(
  appName,
  stackName,
)
  .withDefault({
    prometheusNamespace,
    prometheusWorkspace,
    region: aws.config.requireRegion(),
    logGroupName: `/otel/test/${appName}-${stackName}`,
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
  .configureWebServer(appImage, appPort, {
    environment: [
      { name: 'OTEL_SERVICE_NAME', value: appName },
      { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', value: 'http://127.0.0.1:4318' },
      { name: 'OTEL_EXPORTER_OTLP_PROTOCOL', value: 'http/json' },
    ],
  })
  .configureEcs(ecs)
  .withVpc(vpc.vpc)
  .withOtelCollector(otelCollector)
  .build({ parent });

export { webServer, appName, prometheusWorkspace };
