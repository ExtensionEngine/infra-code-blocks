import { OutputMap } from '@pulumi/pulumi/automation';
import { ElastiCacheClient } from '@aws-sdk/client-elasticache';
import { EC2Client } from '@aws-sdk/client-ec2';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

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
    secretsManager: SecretsManagerClient;
  };
}

export interface RedisTestContext
  extends ConfigContext,
    PulumiProgramContext,
    AwsContext {}
