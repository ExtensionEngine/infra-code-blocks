import { OutputMap } from '@pulumi/pulumi/automation';
import { ACMClient } from '@aws-sdk/client-acm';
import { Route53Client } from '@aws-sdk/client-route-53';

interface AcmCertificateTestConfig {
  certificateDomain: string;
  sanCertificateDomain: string;
  certificateSANs: string[];
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
    acmAlternateRegion: ACMClient;
    route53: Route53Client;
  };
}

export interface AcmCertificateTestContext
  extends ConfigContext, PulumiProgramContext, AwsContext {}
