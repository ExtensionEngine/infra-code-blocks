import { Project, next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

const serviceName = 'web-server-test';
const stackName = pulumi.getStack();
const project: Project = new Project(serviceName, { services: [] });
const tags = { Env: stackName, Project: serviceName };
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
const otelCollector = new studion.openTelemetry.OtelCollectorBuilder(serviceName, stackName)
  .withOTLPReceiver()
  .withDebug()
  .withMetricsPipeline(['otlp'], [], ['debug'])
  .build();

const cluster = new aws.ecs.Cluster(`${serviceName}-cluster`, {
  name: `${serviceName}-cluster-${stackName}`,
  tags
});

const webServer = new studion.WebServerBuilder(serviceName)
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
  .build({ parent: cluster });

export { project, webServer };
