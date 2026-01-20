import * as aws from '@pulumi/aws-v7';
import * as pulumi from '@pulumi/pulumi';
import { CacheStrategy } from './types';

export namespace LbCacheStrategy {
  export type Args = {
    pathPattern: string;
    loadBalancer: pulumi.Input<aws.lb.LoadBalancer>;
  };
}

export class LbCacheStrategy
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
    args: LbCacheStrategy.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:cf:LbCacheStrategy', name, args, opts);

    this.name = name;

    const { pathPattern, loadBalancer } = args;

    this.pathPattern = pathPattern;
    this.cachePolicy = this.createCachePolicy();
    this.responseHeadersPolicy = this.createResponseHeadersPolicy();

    this.config = {
      targetOriginId: pulumi.output(loadBalancer).apply(lb => lb.arn),
      viewerProtocolPolicy: 'redirect-to-https',
      allowedMethods: [
        'GET',
        'HEAD',
        'OPTIONS',
        'PUT',
        'POST',
        'PATCH',
        'DELETE',
      ],
      cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
      compress: true,
      cachePolicyId: this.cachePolicy.id,
      originRequestPolicyId: aws.cloudfront
        .getOriginRequestPolicyOutput({ name: 'Managed-AllViewer' })
        .apply(policy => policy.id!),
      responseHeadersPolicyId: this.responseHeadersPolicy.id,
    };

    this.registerOutputs();
  }

  private createCachePolicy() {
    return new aws.cloudfront.CachePolicy(
      `${this.name}-lb-cache-policy`,
      {
        defaultTtl: 0,
        minTtl: 0,
        maxTtl: 3600, // 1 hour
        parametersInCacheKeyAndForwardedToOrigin: {
          cookiesConfig: {
            cookieBehavior: 'none',
          },
          headersConfig: {
            headerBehavior: 'none',
          },
          queryStringsConfig: {
            queryStringBehavior: 'all',
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
      `${this.name}-lb-res-headers-policy`,
      {
        customHeadersConfig: {
          items: [
            {
              header: 'Cache-Control',
              value: 'no-store',
              override: false,
            },
          ],
        },
        securityHeadersConfig: {
          contentTypeOptions: {
            override: true,
          },
          frameOptions: {
            frameOption: 'SAMEORIGIN',
            override: false,
          },
          referrerPolicy: {
            referrerPolicy: 'strict-origin-when-cross-origin',
            override: false,
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

  public getPathConfig(): aws.types.input.cloudfront.DistributionOrderedCacheBehavior {
    return {
      pathPattern: this.pathPattern,
      ...this.config,
    };
  }
}
