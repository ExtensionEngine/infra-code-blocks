import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { AcmCertificate } from './acm-certificate';

export type StaticSiteArgs = {
  /**
   * The domain which will be used to access the static site.
   * The domain or subdomain must belong to the provided hostedZone.
   */
  domain: pulumi.Input<string>;
  /**
   * The ID of the hosted zone.
   */
  hostedZoneId: pulumi.Input<string>;
  /**
   * A map of tags to assign to the resource.
   */
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

export class StaticSite extends pulumi.ComponentResource {
  certificate: AcmCertificate;
  bucket: aws.s3.Bucket;
  cloudfront: aws.cloudfront.Distribution;

  constructor(
    name: string,
    args: StaticSiteArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:StaticSite', name, {}, opts);

    const certificate = new AcmCertificate(
      `${args.domain}-acm-certificate`,
      {
        domain: args.domain,
        hostedZoneId: args.hostedZoneId,
      },
      { parent: this },
    );

    const bucket = new aws.s3.Bucket(
      `${name}-bucket`,
      {
        bucket: name,
        website: {
          indexDocument: 'index.html',
          errorDocument: 'index.html',
        },
        tags: args.tags,
      },
      { parent: this },
    );

    const bucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
      `${name}-bucket-access-block`,
      {
        bucket: bucket.id,
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      { parent: this },
    );

    const siteBucketPolicy = new aws.s3.BucketPolicy(
      `${name}-bucket-policy`,
      {
        bucket: bucket.bucket,
        policy: bucket.bucket.apply(publicReadPolicy),
      },
      { parent: this, dependsOn: [bucketPublicAccessBlock] },
    );

    function publicReadPolicy(bucketName: string): aws.iam.PolicyDocument {
      return {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      };
    }

    const cloudfront = new aws.cloudfront.Distribution(
      `${name}-cloudfront`,
      {
        enabled: true,
        defaultRootObject: 'index.html',
        aliases: [args.domain],
        isIpv6Enabled: true,
        waitForDeployment: true,
        httpVersion: 'http2and3',
        viewerCertificate: {
          acmCertificateArn: certificate.certificate.arn,
          sslSupportMethod: 'sni-only',
          minimumProtocolVersion: 'TLSv1.2_2021',
        },
        origins: [
          {
            originId: bucket.arn,
            domainName: bucket.websiteEndpoint,
            connectionAttempts: 3,
            connectionTimeout: 10,
            customOriginConfig: {
              originProtocolPolicy: 'http-only',
              httpPort: 80,
              httpsPort: 443,
              originSslProtocols: ['TLSv1.2'],
            },
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: bucket.arn,
          viewerProtocolPolicy: 'redirect-to-https',
          allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
          cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
          compress: true,
          defaultTtl: 86400,
          minTtl: 1,
          maxTtl: 31536000,
          forwardedValues: {
            cookies: { forward: 'none' },
            queryString: false,
          },
        },
        priceClass: 'PriceClass_100',
        restrictions: {
          geoRestriction: { restrictionType: 'none' },
        },
        tags: args.tags,
      },
      { parent: this },
    );

    const cdnAliasRecord = new aws.route53.Record(
      `${name}-cdn-route53-record`,
      {
        type: 'A',
        name: args.domain,
        zoneId: args.hostedZoneId,
        aliases: [
          {
            name: cloudfront.domainName,
            zoneId: cloudfront.hostedZoneId,
            evaluateTargetHealth: true,
          },
        ],
      },
      { parent: this },
    );

    this.certificate = certificate;
    this.bucket = bucket;
    this.cloudfront = cloudfront;
    this.registerOutputs();
  }
}
