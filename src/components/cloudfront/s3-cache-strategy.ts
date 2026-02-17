import * as aws from '@pulumi/aws-v7';
import * as pulumi from '@pulumi/pulumi';
import { CacheStrategy } from './types';

export namespace S3CacheStrategy {
  export type Args = {
    pathPattern: string;
    bucket: pulumi.Input<aws.s3.Bucket>;
    cacheTtl?: pulumi.Input<number>;
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
    super('studion:cloudfront:S3CacheStrategy', name, args, opts);

    this.name = name;

    const { pathPattern, bucket, cacheTtl } = args;

    this.pathPattern = pathPattern;
    this.cachePolicy = this.createCachePolicy(cacheTtl);
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

  private createCachePolicy(ttl?: S3CacheStrategy.Args['cacheTtl']) {
    const enableEncoding = pulumi.output(ttl).apply(val => val !== 0);

    return new aws.cloudfront.CachePolicy(
      `${this.name}-cache-policy`,
      {
        defaultTtl: ttl ?? 86400, // default to 1 day
        minTtl: ttl ?? 60, // default to 1 minute
        maxTtl: ttl ?? 31536000, // default to 1 year
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
          enableAcceptEncodingGzip: enableEncoding,
          enableAcceptEncodingBrotli: enableEncoding,
        },
      },
      { parent: this },
    );
  }

  private createResponseHeadersPolicy() {
    return new aws.cloudfront.ResponseHeadersPolicy(
      `${this.name}-res-headers-policy`,
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
