import { Database, Project, Services } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

require('dotenv').config();

const dbName = process.env.DB_NAME || '';
const dbUsername = process.env.DB_USERNAME || '';
const dbPassword = process.env.DB_PASSWORD || '';
const env = process.env.NODE_ENV || 'development';

const webServerImage = createWebServerImage();

const project: Project = new Project('database-project', {
  services: [
    {
      type: 'DATABASE',
      serviceName: 'database-example',
      dbName: dbName,
      username: dbUsername,
      password: dbPassword,
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
            name: 'DB_URL',
            value: db.instance.address,
          },
          {
            name: 'DB_NAME',
            value: dbName,
          },
          {
            name: 'DB_USERNAME',
            value: dbUsername,
          },
          {
            name: 'DB_PASSWORD',
            value: dbPassword,
          },
          {
            name: 'NODE_ENV',
            value: env,
          },
        ];
      },
    },
  ],
});

function createWebServerImage() {
  const imageRepository = new aws.ecr.Repository('database-web-server', {
    name: 'database-web-server',
    forceDelete: true,
  });

  return new awsx.ecr.Image('database-web-server', {
    repositoryUrl: imageRepository.repositoryUrl,
    context: './web-server',
    extraOptions: ['--platform', 'linux/amd64', '--ssh', 'default'],
  });
}

export default project.name;
