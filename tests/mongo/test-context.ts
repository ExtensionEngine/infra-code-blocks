import { OutputMap } from '@pulumi/pulumi/automation';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EC2Client } from '@aws-sdk/client-ec2';
import { EFSClient } from '@aws-sdk/client-efs';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ServiceDiscoveryClient } from '@aws-sdk/client-servicediscovery';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';

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
    ecs: ECSClient;
    ec2: EC2Client;
    efs: EFSClient;
    secretsManager: SecretsManagerClient;
    servicediscovery: ServiceDiscoveryClient;
    cloudwatchLogs: CloudWatchLogsClient;
  };
}

export interface MongoTestContext
  extends ConfigContext,
    PulumiProgramContext,
    AwsContext {}
