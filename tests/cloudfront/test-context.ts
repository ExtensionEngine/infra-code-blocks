import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { Route53Client } from '@aws-sdk/client-route-53';
import * as aws from '@pulumi/aws-v7';
import * as studion from '@studion/infra-code-blocks';
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
  cfWithVariousBehaviorsS3TtlPathPattern: string;
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
  cfMinimal: studion.CloudFront;
  cfWithDomain: studion.CloudFront;
  certificate: studion.AcmCertificate;
  cfWithCertificate: studion.CloudFront;
  loadBalancer: aws.lb.LoadBalancer;
  s3WebsiteBucket: aws.s3.Bucket;
  s3WebsiteBucketConfig: aws.s3.BucketWebsiteConfiguration;
  s3TtlWebsiteBucket: aws.s3.Bucket;
  customWebsiteBucket: aws.s3.Bucket;
  customWebsiteBucketConfig: aws.s3.BucketWebsiteConfiguration;
  customCachePolicy: aws.cloudfront.CachePolicy;
  customOriginRequestPolicy: aws.cloudfront.OriginRequestPolicy;
  customResponseHeadersPolicy: aws.cloudfront.ResponseHeadersPolicy;
  cfWithVariousBehaviors: studion.CloudFront;
}

export interface CloudFrontTestContext
  extends ConfigContext<Config>,
    AwsContext<AwsClients>,
    PulumiProgramContext<ProgramOutput> {}
