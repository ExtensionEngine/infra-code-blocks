import { Project } from '../../../src';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as path from 'path';

const webServerImage = createWebServerImage();
const serviceName = 'web-server-example';

const project: Project = new Project('web-server-test', {
  services: [
    {
      type: 'WEB_SERVER',
      serviceName,
      port: 3000,
      image: webServerImage.imageUri,
      desiredCount: 1,
      size: 'small',
      autoscaling: { enabled: false }
    }
  ]
});

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

export { project };
