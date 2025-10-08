import { OutputMap } from '@pulumi/pulumi/automation';
import { ElastiCacheClient } from '@aws-sdk/client-elasticache';
import { EC2Client } from '@aws-sdk/client-ec2';

interface ConfigContext {
  config: {
    [key: string]: any;
  };
}

interface PulumiProgramContext {
  outputs: OutputMap;
}

interface AwsContext {
  clients: {
    elasticache: ElastiCacheClient;
    ec2: EC2Client;
  };
}

export interface RedisTestContext
  extends ConfigContext,
    PulumiProgramContext,
    AwsContext {}
