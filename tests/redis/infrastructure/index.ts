import * as pulumi from '@pulumi/pulumi';
import { Project, next as studion } from '@studion/infra-code-blocks';

const appName = 'redis-test';
const stackName = pulumi.getStack();
const tags = {
  Project: appName,
  Environment: stackName,
};

const project = new Project(appName, { services: [] });

const elastiCacheRedis = new studion.ElastiCacheRedis(
  `${appName}-elasticache`,
  {
    vpc: project.vpc,
    engineVersion: '6.x',
    nodeType: 'cache.t4g.micro',
    parameterGroupName: 'default.redis6.x',
    tags,
  },
);

module.exports = {
  project,
  elastiCacheRedis,
};
