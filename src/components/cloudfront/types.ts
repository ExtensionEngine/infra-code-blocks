import * as aws from '@pulumi/aws-v7';

export interface CacheStrategy {
  pathPattern: string;
  config: aws.types.input.cloudfront.DistributionDefaultCacheBehavior;
  cachePolicy: aws.cloudfront.CachePolicy;
  originRequestPolicy?: aws.cloudfront.OriginRequestPolicy;
  responseHeadersPolicy?: aws.cloudfront.ResponseHeadersPolicy;
  getPathConfig: () => aws.types.input.cloudfront.DistributionOrderedCacheBehavior;
}
