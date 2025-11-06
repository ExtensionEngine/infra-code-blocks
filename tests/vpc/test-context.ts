import { EC2Client } from '@aws-sdk/client-ec2';
import { OutputMap } from '@pulumi/pulumi/automation';

interface VpcTestConfig {}

interface ConfigContext {
  config: VpcTestConfig;
}

interface PulumiProgramContext {
  outputs: OutputMap;
}

interface AwsContext {
  clients: {
    ec2: EC2Client;
  };
}

export interface VpcTestContext
  extends ConfigContext,
    PulumiProgramContext,
    AwsContext {}
