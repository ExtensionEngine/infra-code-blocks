import * as pulumi from '@pulumi/pulumi';
import * as upstash from '@upstash/pulumi';
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

let upstashRedis: studion.UpstashRedis | undefined;
const upstashEmail = process.env.UPSTASH_EMAIL;
const upstashApiKey = process.env.UPSTASH_API_KEY;
if (upstashEmail && upstashApiKey) {
  const upstashProvider = new upstash.Provider('upstash', {
    email: upstashEmail,
    apiKey: upstashApiKey,
  });

  upstashRedis = new studion.UpstashRedis(
    `${appName}-upstash`,
    {
      dbName: `${appName}-upstash`,
    },
    { provider: upstashProvider },
  );
}

module.exports = {
  project,
  elastiCacheRedis,
  ...(upstashRedis && { upstashRedis }),
};
