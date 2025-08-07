import { OutputMap } from '@pulumi/pulumi/automation';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ServiceDiscoveryClient } from '@aws-sdk/client-servicediscovery';
import { ApplicationAutoScalingClient } from '@aws-sdk/client-application-auto-scaling';
import { EFSClient } from '@aws-sdk/client-efs';

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
    elb: ElasticLoadBalancingV2Client;
    sd: ServiceDiscoveryClient;
    appAutoscaling: ApplicationAutoScalingClient;
    efs: EFSClient;
  };
}

export interface EcsTestContext
  extends ConfigContext,
    PulumiProgramContext,
    AwsContext {}
