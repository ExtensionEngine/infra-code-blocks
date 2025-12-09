import { OutputMap } from '@pulumi/pulumi/automation';
import { ACMClient } from '@aws-sdk/client-acm';
import { Route53Client } from '@aws-sdk/client-route-53';

interface AcmCertificateTestConfig {
  certificateName: string;
  subDomainName: string;
  exponentialBackOffConfig: {
    delayFirstAttempt: boolean;
    numOfAttempts: number;
    startingDelay: number;
    timeMultiple: number;
    jitter: 'full' | 'none';
  };
}

interface ConfigContext {
  config: AcmCertificateTestConfig;
}

interface PulumiProgramContext {
  outputs: OutputMap;
}

interface AwsContext {
  clients: {
    acm: ACMClient;
    route53: Route53Client;
  };
}

export interface AcmCertificateTestContext
  extends ConfigContext,
    PulumiProgramContext,
    AwsContext {}
