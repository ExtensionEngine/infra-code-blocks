import { it } from 'node:test';
import * as assert from 'node:assert';
import { Unwrap } from '@pulumi/pulumi';
import { request } from 'undici';
import status from 'http-status';
import { CloudFrontTestContext } from './test-context';
import { backOff } from '../util';
import {
  GetCachePolicyCommand,
  GetResponseHeadersPolicyCommand,
} from '@aws-sdk/client-cloudfront';

export function testCloudFrontWithVariousBehaviors(ctx: CloudFrontTestContext) {
  it('should have origins correctly configured', () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const origins = dist.origins as unknown as Unwrap<typeof dist.origins>;

    assert.strictEqual(origins.length, 3, 'Origins should have length of 3');
  });

  it('should have origin for LB behavior correctly configured', () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const lb = ctx.outputs!.loadBalancer;
    const lbArn = lb.arn as unknown as Unwrap<typeof lb.arn>;
    const dist = cf.distribution;
    const origins = dist.origins as unknown as Unwrap<typeof dist.origins>;
    const lbOrigin = origins.find(it => it.originId === lbArn);

    assert.partialDeepStrictEqual(
      lbOrigin,
      {
        domainName: ctx.config.loadBalancerDomain,
        customOriginConfig: {
          originProtocolPolicy: 'https-only',
        },
      },
      'Load balancer origin should exist and be correctly configured',
    );
  });

  it('should have origin for S3 behavior correctly configured', () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const s3Bucket = ctx.outputs!.s3WebsiteBucket;
    const s3WsConfig = ctx.outputs!.s3WebsiteBucketConfig;
    const bucketArn = s3Bucket.arn as unknown as Unwrap<typeof s3Bucket.arn>;
    const dist = cf.distribution;
    const origins = dist.origins as unknown as Unwrap<typeof dist.origins>;
    const s3Origin = origins.find(it => it.originId === bucketArn);

    assert.partialDeepStrictEqual(
      s3Origin,
      {
        domainName: s3WsConfig.websiteEndpoint,
        customOriginConfig: {
          originProtocolPolicy: 'http-only',
        },
      },
      'S3 origin should exist and be correctly configured',
    );
  });

  it('should have origin for Custom behavior correctly configured', () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const customBucket = ctx.outputs!.customWebsiteBucket;
    const customWsConfig = ctx.outputs!.customWebsiteBucketConfig;
    const bucketId = customBucket.id as unknown as Unwrap<
      typeof customBucket.id
    >;
    const dist = cf.distribution;
    const origins = dist.origins as unknown as Unwrap<typeof dist.origins>;
    const customOrigin = origins.find(it => it.originId === bucketId);

    assert.partialDeepStrictEqual(
      customOrigin,
      {
        domainName: customWsConfig.websiteEndpoint,
        customOriginConfig: {
          originProtocolPolicy:
            ctx.config.cfWithVariousBehaviorsCustomOriginProtocolPolicy,
        },
      },
      'Custom origin should exist and be correctly configured',
    );
  });

  it('should have default cache behavior correctly configured', () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const customBucket = ctx.outputs!.customWebsiteBucket;
    const cachePolicy = ctx.outputs!.customCachePolicy;
    const originRequestPolicy = ctx.outputs!.customOriginRequestPolicy;
    const responseHeadersPolicy = ctx.outputs!.customResponseHeadersPolicy;
    const dist = cf.distribution;

    assert.partialDeepStrictEqual(
      dist.defaultCacheBehavior,
      {
        targetOriginId: customBucket.id,
        allowedMethods: ctx.config.cfWithVariousBehaviorsCustomAllowedMethods,
        compress: ctx.config.cfWithVariousBehaviorsCustomCompress,
        viewerProtocolPolicy: 'redirect-to-https',
        cachePolicyId: cachePolicy.id,
        originRequestPolicyId: originRequestPolicy.id,
        responseHeadersPolicyId: responseHeadersPolicy.id,
      },
      'Default cache behavior should be correctly configured',
    );
  });

  it('should have ordered cache behaviors correctly configured', () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const orderedCacheBehaviors =
      dist.orderedCacheBehaviors as unknown as Unwrap<
        typeof dist.orderedCacheBehaviors
      >;

    assert.strictEqual(
      orderedCacheBehaviors?.length,
      2,
      'Ordered cache behaviors should have length of 2',
    );
  });

  it('should have ordered cache behavior for LB behavior correctly configured', () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const lb = ctx.outputs!.loadBalancer;
    const dist = cf.distribution;
    const orderedCacheBehaviors =
      dist.orderedCacheBehaviors as unknown as Unwrap<
        typeof dist.orderedCacheBehaviors
      >;
    const lbCache = orderedCacheBehaviors?.find(
      it => it.pathPattern === ctx.config.cfWithVariousBehaviorsLbPathPattern,
    );

    assert.partialDeepStrictEqual(
      lbCache,
      {
        targetOriginId: lb.arn,
        allowedMethods: [
          'DELETE',
          'GET',
          'HEAD',
          'OPTIONS',
          'PATCH',
          'POST',
          'PUT',
        ],
        cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
        compress: true,
        viewerProtocolPolicy: 'redirect-to-https',
        originRequestPolicyId: '216adef6-5c7f-47e4-b989-5492eafa07d3',
      },
      'Load balancer ordered cache behavior must be correctly configured',
    );
  });

  it('should have cache policy of LB ordered cache behavior correctly configured', async () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const orderedCacheBehaviors =
      dist.orderedCacheBehaviors as unknown as Unwrap<
        typeof dist.orderedCacheBehaviors
      >;
    const lbCache = orderedCacheBehaviors?.find(
      it => it.pathPattern === ctx.config.cfWithVariousBehaviorsLbPathPattern,
    );

    const command = new GetCachePolicyCommand({ Id: lbCache!.cachePolicyId });
    const response = await ctx.clients.cf.send(command);
    const cachePolicy = response.CachePolicy;

    assert.partialDeepStrictEqual(
      cachePolicy?.CachePolicyConfig,
      {
        DefaultTTL: 0,
        MinTTL: 0,
        MaxTTL: 3600, // 1 hour
        ParametersInCacheKeyAndForwardedToOrigin: {
          CookiesConfig: {
            CookieBehavior: 'none',
          },
          HeadersConfig: {
            HeaderBehavior: 'none',
          },
          QueryStringsConfig: {
            QueryStringBehavior: 'all',
          },
          EnableAcceptEncodingGzip: true,
          EnableAcceptEncodingBrotli: true,
        },
      },
      'Cache policy of LB ordered cache behavior must be correctly configured',
    );
  });

  it('should have response headers policy of LB ordered cache behavior correctly configured', async () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const orderedCacheBehaviors =
      dist.orderedCacheBehaviors as unknown as Unwrap<
        typeof dist.orderedCacheBehaviors
      >;
    const lbCache = orderedCacheBehaviors?.find(
      it => it.pathPattern === ctx.config.cfWithVariousBehaviorsLbPathPattern,
    );

    const command = new GetResponseHeadersPolicyCommand({
      Id: lbCache!.responseHeadersPolicyId,
    });
    const response = await ctx.clients.cf.send(command);
    const responseHeadersPolicy = response.ResponseHeadersPolicy;

    assert.partialDeepStrictEqual(
      responseHeadersPolicy?.ResponseHeadersPolicyConfig,
      {
        CustomHeadersConfig: {
          Items: [
            {
              Header: 'Cache-Control',
              Value: 'no-store',
              Override: false,
            },
          ],
        },
        SecurityHeadersConfig: {
          ContentTypeOptions: {
            Override: true,
          },
          FrameOptions: {
            FrameOption: 'SAMEORIGIN',
            Override: false,
          },
          ReferrerPolicy: {
            ReferrerPolicy: 'strict-origin-when-cross-origin',
            Override: false,
          },
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 31536000,
            IncludeSubdomains: true,
            Preload: true,
            Override: true,
          },
        },
      },
      'Response headers policy of LB ordered cache behavior must be correctly configured',
    );
  });

  it('should have ordered cache behavior for S3 behavior correctly configured', () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const s3Bucket = ctx.outputs!.s3WebsiteBucket;
    const dist = cf.distribution;
    const orderedCacheBehaviors =
      dist.orderedCacheBehaviors as unknown as Unwrap<
        typeof dist.orderedCacheBehaviors
      >;
    const s3Cache = orderedCacheBehaviors?.find(
      it => it.pathPattern === ctx.config.cfWithVariousBehaviorsS3PathPattern,
    );

    assert.partialDeepStrictEqual(
      s3Cache,
      {
        targetOriginId: s3Bucket.arn,
        allowedMethods: ['GET', 'HEAD'],
        cachedMethods: ['GET', 'HEAD'],
        compress: true,
        viewerProtocolPolicy: 'redirect-to-https',
        originRequestPolicyId: '',
      },
      'S3 ordered cache behavior must be correctly configured',
    );
  });

  it('should have cache policy of S3 ordered cache behavior correctly configured', async () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const orderedCacheBehaviors =
      dist.orderedCacheBehaviors as unknown as Unwrap<
        typeof dist.orderedCacheBehaviors
      >;
    const s3Cache = orderedCacheBehaviors?.find(
      it => it.pathPattern === ctx.config.cfWithVariousBehaviorsS3PathPattern,
    );

    const command = new GetCachePolicyCommand({ Id: s3Cache!.cachePolicyId });
    const response = await ctx.clients.cf.send(command);
    const cachePolicy = response.CachePolicy;

    assert.partialDeepStrictEqual(
      cachePolicy?.CachePolicyConfig,
      {
        DefaultTTL: 86400,
        MinTTL: 60,
        MaxTTL: 31536000,
        ParametersInCacheKeyAndForwardedToOrigin: {
          CookiesConfig: {
            CookieBehavior: 'none',
          },
          HeadersConfig: {
            HeaderBehavior: 'none',
          },
          QueryStringsConfig: {
            QueryStringBehavior: 'none',
          },
          EnableAcceptEncodingGzip: true,
          EnableAcceptEncodingBrotli: true,
        },
      },
      'Cache policy of S3 ordered cache behavior must be correctly configured',
    );
  });

  it('should have response headers policy of S3 ordered cache behavior correctly configured', async () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const orderedCacheBehaviors =
      dist.orderedCacheBehaviors as unknown as Unwrap<
        typeof dist.orderedCacheBehaviors
      >;
    const s3Cache = orderedCacheBehaviors?.find(
      it => it.pathPattern === ctx.config.cfWithVariousBehaviorsS3PathPattern,
    );

    const command = new GetResponseHeadersPolicyCommand({
      Id: s3Cache!.responseHeadersPolicyId,
    });
    const response = await ctx.clients.cf.send(command);
    const responseHeadersPolicy = response.ResponseHeadersPolicy;

    assert.partialDeepStrictEqual(
      responseHeadersPolicy?.ResponseHeadersPolicyConfig,
      {
        CustomHeadersConfig: {
          Items: [
            {
              Header: 'Cache-Control',
              Value: 'no-cache',
              Override: false,
            },
          ],
        },
        SecurityHeadersConfig: {
          ContentTypeOptions: {
            Override: true,
          },
          FrameOptions: {
            FrameOption: 'DENY',
            Override: true,
          },
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 31536000,
            IncludeSubdomains: true,
            Preload: true,
            Override: true,
          },
        },
      },
      'Response headers policy of S3 ordered cache behavior must be correctly configured',
    );
  });

  it('should have distribution that respond to requests for LB Origin', async () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const path = ctx.config.cfWithVariousBehaviorsLbPathPattern.slice(0, -1);
    const url = `https://${dist.domainName}${path}`;

    await backOff(async () => {
      const response = await request(url);

      assert.strictEqual(
        response.statusCode,
        status.OK,
        `Distribution for LB origin should respond with status code 200, got ${response.statusCode}`,
      );
    });
  });

  it('should have distribution that respond to requests for S3 Origin', async () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const path = ctx.config.cfWithVariousBehaviorsS3PathPattern.slice(0, -1);
    const url = `https://${dist.domainName}${path}`;

    await backOff(async () => {
      const response = await request(url);

      assert.strictEqual(
        response.statusCode,
        status.OK,
        `Distribution for S3 origin should respond with status code 200, got ${response.statusCode}`,
      );
    });
  });

  it('should have distribution that respond to requests for Custom Origin', async () => {
    const cf = ctx.outputs!.cfWithVariousBehaviors;
    const dist = cf.distribution;
    const url = `https://${dist.domainName}`;

    await backOff(async () => {
      const response = await request(url);

      assert.strictEqual(
        response.statusCode,
        status.OK,
        `Distribution for Custom origin should respond with status code 200, got ${response.statusCode}`,
      );
    });
  });
}
