import { Project, next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import {
  webServerName,
  healthCheckPath,
  webServerWithDomainConfig,
  webServerWithSanCertificateConfig,
  webServerWithCertificateConfig,
} from './config';

const stackName = pulumi.getStack();
const project: Project = new Project(webServerName, { services: [] });
const tags = { Env: stackName, Project: webServerName };
const init = {
  name: 'init',
  image: 'busybox:latest',
  essential: false,
  command: ['sh', '-c', 'echo "Init container running" && exit 0'],
};
const sidecar = {
  name: 'sidecar',
  image: 'busybox:latest',
  essential: true,
  command: ['sh', '-c', 'echo "Sidecar running" && sleep infinity'],
  healthCheck: {
    command: ['CMD-SHELL', 'echo healthy || exit 1'],
    interval: 30,
    timeout: 5,
    retries: 3,
    startPeriod: 10,
  },
};
const otelCollector = new studion.openTelemetry.OtelCollectorBuilder(
  webServerName,
  stackName,
)
  .withOTLPReceiver()
  .withDebug()
  .withMetricsPipeline(['otlp'], [], ['debug'])
  .build();

const cluster = new aws.ecs.Cluster(`${webServerName}-cluster`, {
  name: `${webServerName}-cluster-${stackName}`,
  tags,
});
const ecs = {
  cluster,
  desiredCount: 1,
  size: 'small' as const,
  autoscaling: { enabled: false },
};

const webServer = new studion.WebServerBuilder(webServerName)
  .configureWebServer('nginxdemos/nginx-hello:plain-text', 8080)
  .configureEcs(ecs)
  .withInitContainer(init)
  .withSidecarContainer(sidecar)
  .withVpc(project.vpc)
  .withOtelCollector(otelCollector)
  .withCustomHealthCheckPath(healthCheckPath)
  .build({ parent: cluster });

const hostedZone = aws.route53.getZoneOutput({
  zoneId: process.env.ICB_HOSTED_ZONE_ID,
  privateZone: false,
});

// TODO: wildcard
const webServerWithDomain = new studion.WebServerBuilder(`web-server-domain`)
  .configureWebServer('nginxdemos/nginx-hello:plain-text', 8080)
  .configureEcs(ecs)
  .withVpc(project.vpc)
  .withCustomHealthCheckPath(healthCheckPath)
  .withCustomDomain(webServerWithDomainConfig.primary, hostedZone.zoneId)
  .build({ parent: cluster });

const sanWebServerCert = new studion.AcmCertificate(
  `${webServerName}-san-cert`,
  {
    domain: webServerWithSanCertificateConfig.primary,
    subjectAlternativeNames: webServerWithSanCertificateConfig.sans,
    hostedZoneId: hostedZone.zoneId,
  },
);
const webServerWithSanCertificate = new studion.WebServerBuilder(
  `web-server-san`,
)
  .configureWebServer('nginxdemos/nginx-hello:plain-text', 8080)
  .configureEcs(ecs)
  .withVpc(project.vpc)
  .withCustomHealthCheckPath(healthCheckPath)
  .withCertificate(sanWebServerCert, hostedZone.zoneId)
  .build({ parent: cluster });

const certWebServer = new studion.AcmCertificate(`${webServerName}-cert`, {
  domain: webServerWithCertificateConfig.primary,
  subjectAlternativeNames: webServerWithCertificateConfig.sans,
  hostedZoneId: hostedZone.zoneId,
});
const webServerWithCertificate = new studion.WebServerBuilder(`web-server-cert`)
  .configureWebServer('nginxdemos/nginx-hello:plain-text', 8080)
  .configureEcs(ecs)
  .withVpc(project.vpc)
  .withCustomHealthCheckPath(healthCheckPath)
  .withCertificate(
    certWebServer,
    hostedZone.zoneId,
    webServerWithCertificateConfig.primary,
  )
  .build({ parent: cluster });

export {
  project,
  webServer,
  otelCollector,
  webServerWithSanCertificate,
  webServerWithCertificate,
  webServerWithDomain,
};
