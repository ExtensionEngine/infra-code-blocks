import * as aws from '@pulumi/aws-v7';
import * as pulumi from '@pulumi/pulumi';
import { CacheStrategy } from './types';

export namespace S3CacheStrategy {
  export type Args = {
    pathPattern: string;
    bucket: pulumi.Input<aws.s3.Bucket>;
  };
}

export class S3CacheStrategy
  extends pulumi.ComponentResource
  implements CacheStrategy
{
  name: string;
  pathPattern: string;
  config: aws.types.input.cloudfront.DistributionDefaultCacheBehavior;
  cachePolicy: aws.cloudfront.CachePolicy;
  responseHeadersPolicy: aws.cloudfront.ResponseHeadersPolicy;

  constructor(
    name: string,
    args: S3CacheStrategy.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:cf:S3CacheStrategy', name, args, opts);

    this.name = name;

    const { pathPattern, bucket } = args;

    this.pathPattern = pathPattern;
    this.cachePolicy = this.createCachePolicy();
    this.responseHeadersPolicy = this.createResponseHeadersPolicy();

    this.config = {
      targetOriginId: pulumi.output(bucket).apply(b => b.arn),
      viewerProtocolPolicy: 'redirect-to-https',
      allowedMethods: ['GET', 'HEAD'],
      cachedMethods: ['GET', 'HEAD'],
      compress: true,
      cachePolicyId: this.cachePolicy.id,
      responseHeadersPolicyId: this.responseHeadersPolicy.id,
    };

    this.registerOutputs();
  }

  private createCachePolicy() {
    return new aws.cloudfront.CachePolicy(
      `${this.name}-s3-cache-policy`,
      {
        defaultTtl: 86400, // 1 day
        minTtl: 60, // 1 minute
        maxTtl: 31536000, // 1 year
        parametersInCacheKeyAndForwardedToOrigin: {
          cookiesConfig: {
            cookieBehavior: 'none',
          },
          headersConfig: {
            headerBehavior: 'none',
          },
          queryStringsConfig: {
            queryStringBehavior: 'none',
          },
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        },
      },
      { parent: this },
    );
  }

  private createResponseHeadersPolicy() {
    return new aws.cloudfront.ResponseHeadersPolicy(
      `${this.name}-s3-res-headers-policy`,
      {
        customHeadersConfig: {
          items: [
            {
              header: 'Cache-Control',
              value: 'no-cache',
              override: false,
            },
          ],
        },
        securityHeadersConfig: {
          contentTypeOptions: {
            override: true,
          },
          frameOptions: {
            frameOption: 'DENY',
            override: true,
          },
          // instruct browsers to only use HTTPS
          strictTransportSecurity: {
            accessControlMaxAgeSec: 31536000, // 1 year
            includeSubdomains: true,
            preload: true,
            override: true,
          },
        },
      },
      { parent: this },
    );
  }

  getPathConfig(): aws.types.input.cloudfront.DistributionOrderedCacheBehavior {
    return {
      pathPattern: this.pathPattern,
      ...this.config,
    };
  }
}
