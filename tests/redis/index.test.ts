import { describe, it, before, after } from 'node:test';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import { ElastiCacheClient } from '@aws-sdk/client-elasticache';
import { EC2Client } from '@aws-sdk/client-ec2';
import * as automation from '../automation';
import { RedisTestContext } from './test-context';
import { testElastiCacheRedis } from './elasticache-redis.test';
import { testUpstashRedis } from './upstash-redis.test';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-redis',
  program: () => import('./infrastructure'),
};

describe('Redis component deployment', () => {
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error('AWS_REGION environment variable is required');
  }

  const hasUpstashCredentials =
    process.env.UPSTASH_EMAIL && process.env.UPSTASH_API_KEY;
  const ctx: RedisTestContext = {
    outputs: {},
    config: {
      defaultElastiCacheRedisName: 'redis-test-default-elasticache',
      elastiCacheRedisName: 'redis-test-elasticache',
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
    },
  };

  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  describe('ElastiCache Redis', () => testElastiCacheRedis(ctx));
  if (hasUpstashCredentials) {
    describe('Upstash Redis', () => testUpstashRedis(ctx));
  } else {
    console.log(
      'Skipping Upstash redis tests, Upstash credentials were not provided...',
    );
  }
});
