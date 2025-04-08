import { OutputMap } from '@pulumi/pulumi/automation';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ACMClient } from '@aws-sdk/client-acm';
import { Route53Client } from '@aws-sdk/client-route-53';

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
    acm: ACMClient;
    route53: Route53Client;
  };
}

export interface WebServerTestContext extends ConfigContext, PulumiProgramContext, AwsContext { };
