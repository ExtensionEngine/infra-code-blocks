import { Database, Project, Services } from '@studion/infra-code-blocks';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

const databaseConfig = new pulumi.Config('database');
const username = databaseConfig.require('username');
const password = databaseConfig.require('password');
const dbName = databaseConfig.require('dbname');

const passwordSecret = createPasswordSecret(password);

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

        return [
          {
            name: 'DATABASE_USERNAME',
            value: username,
          },
          {
            name: 'DATABASE_HOST',
            value: db.instance.address,
          },
          {
            name: 'DATABASE_DBNAME',
            value: dbName,
          },
          {
            name: 'REDIS_CONNECTION_STRING',
            value: redisConnectionString,
          },
        ];
      },
      secrets: [
        {
          name: 'DATABASE_PASSWORD',
          valueFrom: passwordSecret.arn,
        },
      ],
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

function createPasswordSecret(password: string) {
  const project = pulumi.getProject();
  const stack = pulumi.getStack();

  const passwordSecret = new aws.secretsmanager.Secret(
    'database-password-secret',
    {
      namePrefix: `${stack}/${project}/DatabasePassword-`,
    },
  );

  const passwordSecretValue = new aws.secretsmanager.SecretVersion(
    'database-password-secret-value',
    {
      secretId: passwordSecret.id,
      secretString: password,
    },
    { dependsOn: [passwordSecret] },
  );

  return passwordSecret;
}

export default project.name;
