import { Project } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

require('dotenv').config();

const mongoServiceName = 'mongo-service';

const mongoUsername = process.env.MONGO_USERNAME || '';
const mongoPassword = process.env.MONGO_PASSWORD || '';
const mongoDbName = process.env.MONGO_DB || '';
const mongoPort = parseInt(process.env.MONGO_PORT || '27017');
const mongoConnectionString = `mongodb://${mongoUsername}:${mongoPassword}@${mongoServiceName}.${mongoServiceName}:${mongoPort}/${mongoDbName}`;

const webServerImage = createWebServerImage();

const project: Project = new Project('mongo-project', {
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
      serviceName: 'mongo-web-server',
      port: 3000,
      image: webServerImage.imageUri,
      desiredCount: 1,
      size: 'small',
      autoscaling: { enabled: false },
      environment: () => {
        return [
          {
            name: 'MONGO_CONNECTION_STRING',
            value: mongoConnectionString,
          },
        ];
      },
    },
  ],
});

function createWebServerImage() {
  const imageRepository = new aws.ecr.Repository('repository', {
    forceDelete: true,
  });

  return new awsx.ecr.Image('app', {
    repositoryUrl: imageRepository.repositoryUrl,
    context: './app',
    extraOptions: ['--platform', 'linux/amd64', '--ssh', 'default'],
  });
}

export default project.name;
