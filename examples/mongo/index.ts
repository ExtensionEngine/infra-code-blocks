import { Project } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

require('dotenv').config();

const mongoPort = 27017;
const mongoServiceName = 'mongo-example';
const mongoUsername = process.env.MONGO_USERNAME || '';
const mongoPassword = process.env.MONGO_PASSWORD || '';

const webServerImage = createWebServerImage();

const project = new Project('mongo-project', {
  services: [
    {
      type: 'MONGO',
      serviceName: mongoServiceName,
      port: mongoPort,
      username: mongoUsername,
      password: mongoPassword,
      size: 'small',
    },
    {
      type: 'WEB_SERVER',
      serviceName: 'web-server-example',
      port: 3000,
      image: webServerImage.imageUri,
      domain: 'ptrutanic.gostudion.com',
      desiredCount: 1,
      size: 'small',
      autoscaling: { enabled: false },
      environment: () => {
        return [
          {
            name: 'MONGO_URL',
            value: `mongodb://${mongoServiceName}.${mongoServiceName}:${mongoPort}`,
          },
          {
            name: 'MONGO_USERNAME',
            value: mongoUsername,
          },
          {
            name: 'MONGO_PASSWORD',
            value: mongoPassword,
          },
        ];
      },
    },
  ],
  hostedZoneId: process.env.HOSTED_ZONE_ID,
});

function createWebServerImage() {
  const imageRepository = new aws.ecr.Repository('web-server-ecs-repo', {
    name: 'web-server-mongo-repo',
    forceDelete: true,
  });

  return new awsx.ecr.Image('web-server-img', {
    repositoryUrl: imageRepository.repositoryUrl,
    context: './web-server',
    extraOptions: ['--platform', 'linux/amd64', '--ssh', 'default'],
  });
}

export default project.name;
