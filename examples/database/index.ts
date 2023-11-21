import { Database, Project, Services } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

require('dotenv').config();

const dbName = process.env.DB_NAME || '';
const dbUsername = process.env.DB_USERNAME || '';
const dbPassword = process.env.DB_PASSWORD || '';

const webServerImage = createWebServerImage();

const project = new Project('mongo-project', {
  services: [
    {
      type: 'DATABASE',
      serviceName: 'database-example',
      dbName: dbName,
      username: dbUsername,
      password: dbPassword,
      applyImmediately: false,
      skipFinalSnapshot: true,
      allocatedStorage: 1,
      maxAllocatedStorage: 1,
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
      environment: (services: Services) => {
        const db = services['database-example'] as Database;

        db.instance.address.apply(x => console.log('ddadasdasd', x));

        return [];
      },
    },
  ],
  hostedZoneId: process.env.HOSTED_ZONE_ID,
});

function createWebServerImage() {
  const imageRepository = new aws.ecr.Repository('web-server-ecs-repo', {
    name: 'web-server-repo',
    forceDelete: true,
  });

  return new awsx.ecr.Image('web-server-img', {
    repositoryUrl: imageRepository.repositoryUrl,
    context: './web-server',
    extraOptions: ['--platform', 'linux/amd64', '--ssh', 'default'],
  });
}

export default project.name;
