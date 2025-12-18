import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { Route53Client } from '@aws-sdk/client-route-53';
import { CloudFront } from '../../src/v2/components/cloudfront';
import { AcmCertificate } from '../../src/components/acm-certificate';
import { AwsContext, ConfigContext, PulumiProgramContext } from '../types';

interface Config {
  domainName: string;
  hostedZoneId: string;
  certificateDomain: string;
  cfMinimalName: string;
  cfMinimalOriginId: string;
  cfMinimalOriginProtocolPolicy: string;
  cfMinimalDefaultRootObject: string;
}

interface AwsClients {
  cf: CloudFrontClient;
  route53: Route53Client;
}

export interface ProgramOutput {
  certificate: AcmCertificate;
  cfMinimalOriginDomainName: string;
  cfMinimal: CloudFront;
  cfWithDomain: CloudFront;
  cfWithCertificate: CloudFront;
}

export interface CloudFrontTestContext
  extends ConfigContext<Config>,
    AwsContext<AwsClients>,
    PulumiProgramContext<ProgramOutput> {}
