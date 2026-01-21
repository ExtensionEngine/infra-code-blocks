import { describe, it, before, after } from 'node:test';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import { ElastiCacheClient } from '@aws-sdk/client-elasticache';
import { EC2Client } from '@aws-sdk/client-ec2';
import * as automation from '../automation';
import { RedisTestContext } from './test-context';
import { testElastiCacheRedis } from './elasticache-redis.test';
import { testUpstashRedis } from './upstash-redis.test';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { ECSClient } from '@aws-sdk/client-ecs';
import { requireEnv } from '../util';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-redis',
  program: () => import('./infrastructure'),
};

const region = requireEnv('AWS_REGION');
requireEnv('UPSTASH_EMAIL');
requireEnv('UPSTASH_API_KEY');
const ctx: RedisTestContext = {
  outputs: {},
  config: {
    defaultElastiCacheRedisName: 'redis-test-default-elasticache',
    elastiCacheRedisName: 'redis-test-elasticache',
    elastiCacheTestClientName: 'redis-test-ec-client',
    upstashRedisName: 'redis-test-upstash',
    exponentialBackOffConfig: {
      delayFirstAttempt: true,
      numOfAttempts: 5,
      startingDelay: 2000,
      timeMultiple: 2,
      jitter: 'full',
    },
  },
  clients: {
    elasticache: new ElastiCacheClient({ region }),
    ec2: new EC2Client({ region }),
    secretsManager: new SecretsManagerClient({ region }),
    ecs: new ECSClient({ region }),
    cloudwatchLogs: new CloudWatchLogsClient({ region }),
  },
};

describe('Redis component deployment', () => {
  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  describe('ElastiCache Redis', () => testElastiCacheRedis(ctx));
  describe('Upstash Redis', () => testUpstashRedis(ctx));
});
