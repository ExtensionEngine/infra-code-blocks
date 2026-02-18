import * as studion from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as util from '../../util';
import {
  webServerName,
  healthCheckPath,
  webServerWithDomainConfig,
  webServerWithSanCertificateConfig,
  webServerWithCertificateConfig,
  webServerImageName,
} from './config';

const stackName = pulumi.getStack();
const parent = new pulumi.ComponentResource(
  'studion:webserver:TestGroup',
  `${webServerName}-root`,
);
const vpc = util.getCommonVpc();
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

const cluster = new aws.ecs.Cluster(
  `${webServerName}-cluster`,
  {
    name: `${webServerName}-cluster-${stackName}`,
    tags,
  },
  { parent },
);
const ecs = {
  cluster,
  desiredCount: 1,
  size: 'small' as const,
  autoscaling: { enabled: false },
};

const webServer = new studion.WebServerBuilder(webServerName)
  .configureWebServer(webServerImageName, 8080)
  .configureEcs(ecs)
  .withInitContainer(init)
  .withSidecarContainer(sidecar)
  .withVpc(vpc.vpc)
  .withOtelCollector(otelCollector)
  .withCustomHealthCheckPath(healthCheckPath)
  .withLoadBalancingAlgorithm('least_outstanding_requests')
  .build({ parent: cluster });

const hostedZone = aws.route53.getZoneOutput({
  zoneId: process.env.ICB_HOSTED_ZONE_ID,
  privateZone: false,
});

const webServerWithDomain = new studion.WebServerBuilder(`web-server-domain`)
  .configureWebServer(webServerImageName, 8080)
  .configureEcs(ecs)
  .withVpc(vpc.vpc)
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
  { parent },
);
const webServerWithSanCertificate = new studion.WebServerBuilder(
  `web-server-san`,
)
  .configureWebServer(webServerImageName, 8080)
  .configureEcs(ecs)
  .withVpc(vpc.vpc)
  .withCustomHealthCheckPath(healthCheckPath)
  .withCertificate(sanWebServerCert.certificate, hostedZone.zoneId)
  .build({
    parent: cluster,
    dependsOn: [sanWebServerCert.certificateValidation],
  });

const certWebServer = new studion.AcmCertificate(
  `${webServerName}-cert`,
  {
    domain: webServerWithCertificateConfig.primary,
    subjectAlternativeNames: webServerWithCertificateConfig.sans,
    hostedZoneId: hostedZone.zoneId,
  },
  { parent },
);
const webServerWithCertificate = new studion.WebServerBuilder(`web-server-cert`)
  .configureWebServer(webServerImageName, 8080)
  .configureEcs(ecs)
  .withVpc(vpc.vpc)
  .withCustomHealthCheckPath(healthCheckPath)
  .withCertificate(
    certWebServer.certificate,
    hostedZone.zoneId,
    webServerWithCertificateConfig.primary,
  )
  .build({ parent: cluster, dependsOn: [certWebServer.certificateValidation] });

export {
  webServer,
  otelCollector,
  sanWebServerCert,
  webServerWithSanCertificate,
  certWebServer,
  webServerWithCertificate,
  webServerWithDomain,
};
