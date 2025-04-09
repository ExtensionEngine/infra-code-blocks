import { Project, next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import * as path from 'pathe';

const serviceName = 'web-server-example';
const stackName = pulumi.getStack();
const project: Project = new Project('web-server-test', { services: [] });
const tags = { Env: stackName, Project: serviceName };

const cluster = new aws.ecs.Cluster(`${serviceName}-cluster`, {
  name: `${serviceName}-cluster-${stackName}`,
  tags
});

const webServer = new studion.WebServer(serviceName, {
  cluster,
  vpc: project.vpc,
  publicSubnetIds: project.vpc.publicSubnetIds,
  port: 8080,
  image: 'nginxdemos/nginx-hello:plain-text',
  desiredCount: 1,
  size: 'small',
  autoscaling: { enabled: false }
});

export { project, webServer };
