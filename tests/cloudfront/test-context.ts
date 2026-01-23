import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { Route53Client } from '@aws-sdk/client-route-53';
import * as aws from '@pulumi/aws-v7';
import { CloudFront } from '../../src/v2/components/cloudfront';
import { AcmCertificate } from '../../src/v2/components/acm-certificate';
import { AwsContext, ConfigContext, PulumiProgramContext } from '../types';

interface Config {
  hostedZoneId: string;
  defaultDomain: string;
  certificateDomain: string;
  certificateSANs: string[];
  loadBalancerDomain: string;
  cfMinimalName: string;
  cfMinimalOriginId: string;
  cfMinimalOriginProtocolPolicy: string;
  cfMinimalDefaultRootObject: string;
  cfWithVariousBehaviorsLbPathPattern: string;
  cfWithVariousBehaviorsS3PathPattern: string;
  cfWithVariousBehaviorsCustomOriginProtocolPolicy: string;
  cfWithVariousBehaviorsCustomDefaultRootObject: string;
  cfWithVariousBehaviorsCustomAllowedMethods: string[];
  cfWithVariousBehaviorsCustomCompress: boolean;
}

interface AwsClients {
  cf: CloudFrontClient;
  route53: Route53Client;
}

export interface ProgramOutput {
  cfMinimalOriginDomainName: string;
  cfMinimal: CloudFront;
  cfWithDomain: CloudFront;
  certificate: AcmCertificate;
  cfWithCertificate: CloudFront;
  loadBalancer: aws.lb.LoadBalancer;
  s3WebsiteBucket: aws.s3.Bucket;
  s3WebsiteBucketConfig: aws.s3.BucketWebsiteConfiguration;
  customWebsiteBucket: aws.s3.Bucket;
  customWebsiteBucketConfig: aws.s3.BucketWebsiteConfiguration;
  customCachePolicy: aws.cloudfront.CachePolicy;
  customOriginRequestPolicy: aws.cloudfront.OriginRequestPolicy;
  customResponseHeadersPolicy: aws.cloudfront.ResponseHeadersPolicy;
  cfWithVariousBehaviors: CloudFront;
}

export interface CloudFrontTestContext
  extends ConfigContext<Config>,
    AwsContext<AwsClients>,
    PulumiProgramContext<ProgramOutput> {}
