import { Project } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

const imageRepository = new aws.ecr.Repository('example-ecs-repo', {
  forceDelete: true,
});

const appImg = new awsx.ecr.Image('app-img', {
  repositoryUrl: imageRepository.repositoryUrl,
  dockerfile: '',
});

const project = new Project('mongo-project', {
  services: [
    {
      type: 'MONGO',
      serviceName: 'mongo-example',
      port: 27017,
      username: 'admin',
      password: 'admin',
      size: 'small',
    },
    // {
    //   type: 'WEB_SERVER',
    //   serviceName: 't_web_server',
    //   port: 27017,
    //   image: 'mongo:latest',
    //   domain: 'ptrutanic.gostudion.com',
    // },
  ],
});

export default project.name;
