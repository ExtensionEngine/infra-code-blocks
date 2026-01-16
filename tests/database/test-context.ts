import { EC2Client } from '@aws-sdk/client-ec2';
import { KMSClient } from '@aws-sdk/client-kms';
import { OutputMap } from '@pulumi/pulumi/automation';
import { RDSClient } from '@aws-sdk/client-rds';

interface ConfigContext {
  config: DatabaseTestConfig;
}

interface DatabaseTestConfig {
  appName: string;
  dbName: string;
  dbUsername: string;
}

interface PulumiProgramContext {
  outputs: OutputMap;
}

interface AwsContext {
  clients: {
    rds: RDSClient;
    ec2: EC2Client;
    kms: KMSClient;
  };
}

export interface DatabaseTestContext
  extends ConfigContext,
    PulumiProgramContext,
    AwsContext {}
