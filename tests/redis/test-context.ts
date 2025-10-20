import { OutputMap } from '@pulumi/pulumi/automation';
import { ElastiCacheClient } from '@aws-sdk/client-elasticache';
import { EC2Client } from '@aws-sdk/client-ec2';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { ECSClient } from '@aws-sdk/client-ecs';

interface RedisTestConfig {
  defaultElastiCacheRedisName: string;
  elastiCacheRedisName: string;
  elastiCacheTestClientName: string;
  upstashRedisName: string;
  exponentialBackOffConfig: {
    delayFirstAttempt: boolean;
    numOfAttempts: number;
    startingDelay: number;
    timeMultiple: number;
    jitter: 'full' | 'none';
  };
}

interface ConfigContext {
  config: RedisTestConfig;
}

interface PulumiProgramContext {
  outputs: OutputMap;
}

interface AwsContext {
  clients: {
    elasticache: ElastiCacheClient;
    ec2: EC2Client;
    secretsManager: SecretsManagerClient;
    ecs: ECSClient;
    cloudwatchLogs: CloudWatchLogsClient;
  };
}

export interface RedisTestContext
  extends ConfigContext,
    PulumiProgramContext,
    AwsContext {}
