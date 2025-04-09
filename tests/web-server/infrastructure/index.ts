import { Project, next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import * as path from 'pathe';

const webServerImage = createWebServerImage();
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
  port: 3000,
  image: webServerImage.imageUri,
  desiredCount: 1,
  size: 'small',
  autoscaling: { enabled: false }
});

export { project, webServer };

function createWebServerImage() {
  const imageRepository = new aws.ecr.Repository('repository', {
    forceDelete: true,
  });

  const targetPath = path.join(__dirname, '..', 'app');
  return new awsx.ecr.Image('app', {
    repositoryUrl: imageRepository.repositoryUrl,
    context: targetPath,
    platform: 'linux/amd64',
    extraOptions: ['--platform', 'linux/amd64', '--ssh', 'default']
  } as awsx.ecr.ImageArgs);
}

