import { Project, next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { webServerName, healthCheckPath } from './config';

const stackName = pulumi.getStack();
const project: Project = new Project(webServerName, { services: [] });
const tags = { Env: stackName, Project: webServerName };
const init = {
  name: 'init',
  image: 'busybox:latest',
  essential: false,
  command: ['sh', '-c', 'echo "Init container running" && exit 0']
};
const sidecar = {
  name: 'sidecar',
  image: 'busybox:latest',
  essential: true,
  command: ['sh', '-c', 'echo "Sidecar running" && sleep infinity'],
  healthCheck: {
    command: ["CMD-SHELL", "echo healthy || exit 1"],
    interval: 30,
    timeout: 5,
    retries: 3,
    startPeriod: 10
  }
};
const otelCollector = new studion.openTelemetry.OtelCollectorBuilder(webServerName, stackName)
  .withOTLPReceiver()
  .withDebug()
  .withMetricsPipeline(['otlp'], [], ['debug'])
  .build();

const cluster = new aws.ecs.Cluster(`${webServerName}-cluster`, {
  name: `${webServerName}-cluster-${stackName}`,
  tags
});

const webServer = new studion.WebServerBuilder(webServerName)
  .configureWebServer('nginxdemos/nginx-hello:plain-text', 8080)
  .configureEcs({
    cluster,
    desiredCount: 1,
    size: 'small',
    autoscaling: { enabled: false }
  })
  .withInitContainer(init)
  .withSidecarContainer(sidecar)
  .withVpc(project.vpc)
  .withOtelCollector(otelCollector)
  .withCustomHealthCheckPath(healthCheckPath)
  .build({ parent: cluster });

export { project, webServer, otelCollector };
