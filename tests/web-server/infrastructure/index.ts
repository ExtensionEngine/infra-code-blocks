import { Project, next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

const serviceName = 'web-server-test';
const stackName = pulumi.getStack();
const project: Project = new Project(serviceName, { services: [] });
const tags = { Env: stackName, Project: serviceName };

const cluster = new aws.ecs.Cluster(`${serviceName}-cluster`, {
  name: `${serviceName}-cluster-${stackName}`,
  tags
});

const webServer = new studion.WebServerBuilder(serviceName, {
  image: 'nginxdemos/nginx-hello:plain-text',
  port: 8080
})
  .configureEcs({
    cluster,
    desiredCount: 1,
    size: 'small',
    autoscaling: { enabled: false }
  })
  .withVpc(project.vpc)
  .build({ parent: cluster });

export { project, webServer };
