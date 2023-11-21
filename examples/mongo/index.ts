import { Project } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

const imageRepository = new aws.ecr.Repository('web-server-ecs-repo', {
  name: 'web-server-repo',
  forceDelete: true,
});

const appImg = new awsx.ecr.Image('web-server-img', {
  repositoryUrl: imageRepository.repositoryUrl,
  context: './web-server',
  extraOptions: ['--platform', 'linux/amd64', '--ssh', 'default'],
});

const mongoServiceName = 'mongo-example';

const project = new Project('mongo-project', {
  services: [
    {
      type: 'MONGO',
      serviceName: mongoServiceName,
      port: 27017,
      username: 'admin',
      password: 'admin',
      size: 'small',
    },
    {
      type: 'WEB_SERVER',
      serviceName: 'web-server-example',
      port: 3000,
      image: appImg.imageUri,
      domain: 'ptrutanic.gostudion.com',
      desiredCount: 1,
      autoscaling: { enabled: false },
      environment: () => {
        return [
          {
            name: 'MONGO_URL',
            value: `${mongoServiceName}.${mongoServiceName}`,
          },
        ];
      },
    },
  ],
  hostedZoneId: 'Z034266420CJCR4IBU4AG',
});

export default project.name;
