import { Project } from '@studion/infra-code-blocks';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

const config = new pulumi.Config('mongo');

const serviceName = 'mongo-service';

const host = `${serviceName}.${serviceName}`;
const username = config.require('username');
const password = config.require('password');
const database = config.require('database');
const port = parseInt(config.require('port') || '27017');

const mongoConnectionString = `mongodb://${username}:${password}@${host}:${port}/${database}`;

const webServerImage = createWebServerImage();

const project: Project = new Project('mongo-project', {
  services: [
    {
      type: 'MONGO',
      serviceName: serviceName,
      port: port,
      username: username,
      password: password,
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
