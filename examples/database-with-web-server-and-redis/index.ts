import { Database, Project, Services } from '@studion/infra-code-blocks';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

const databaseConfig = new pulumi.Config('database');
const username = databaseConfig.require('username');
const password = databaseConfig.require('password');
const dbName = databaseConfig.require('dbname');

const redisConfig = new pulumi.Config('redis');
const redisConnectionString = redisConfig.require('connection');

const webServerImage = createWebServerImage();

const project: Project = new Project('database-project', {
  services: [
    {
      type: 'DATABASE',
      serviceName: 'database-example',
      dbName: dbName,
      username,
      password,
      applyImmediately: true,
      skipFinalSnapshot: true,
    },
    {
      type: 'REDIS',
      serviceName: 'redis',
      dbName: 'test-db',
      region: 'us-east-1',
    },
    {
      type: 'WEB_SERVER',
      serviceName: 'web-server-example',
      port: 3000,
      image: webServerImage.imageUri,
      desiredCount: 1,
      size: 'small',
      autoscaling: { enabled: false },
      environment: (services: Services) => {
        const db = services['database-example'] as Database;

        const databaseConnectionString = db.instance.address.apply(
          address =>
            `postgres://${username}:${password}@${address}:5432/${dbName}`,
        );

        return [
          {
            name: 'DATABASE_CONNECTION_STRING',
            value: databaseConnectionString,
          },
          {
            name: 'REDIS_CONNECTION_STRING',
            value: redisConnectionString,
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
