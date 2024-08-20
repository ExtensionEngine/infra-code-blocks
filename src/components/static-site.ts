import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { AcmCertificate } from './acm-certificate';
import { commonTags } from '../constants';

export type StaticSiteArgs = {
  /**
   * The domain which will be used to access the static site.
   * The domain or subdomain must belong to the provided hostedZone.
   */
  domain?: pulumi.Input<string>;
  /**
   * The ID of the hosted zone.
   */
  hostedZoneId?: pulumi.Input<string>;
  /**
   * ARN of the CloudFront viewer-request function.
   */
  viewerRequestFunctionArn?: pulumi.Input<string>;
  /**
   * A map of tags to assign to the resource.
   */
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

export class StaticSite extends pulumi.ComponentResource {
  name: string;
  certificate?: AcmCertificate;
  bucket: aws.s3.Bucket;
  cloudfront: aws.cloudfront.Distribution;

  constructor(
    name: string,
    args: StaticSiteArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:StaticSite', name, {}, opts);

    this.name = name;
    const { domain, hostedZoneId, viewerRequestFunctionArn, tags } = args;
    const hasCustomDomain = domain && hostedZoneId;
    if (domain && !hostedZoneId) {
      throw new Error(
        'StaticSite:hostedZoneId must be provided when the domain is specified',
      );
    }
    if (hasCustomDomain) {
      this.certificate = this.createTlsCertificate({ domain, hostedZoneId });
    }
    this.bucket = this.createPublicBucket({ tags });
    this.cloudfront = this.createCloudfrontDistribution({
      domain,
      viewerRequestFunctionArn,
      tags,
    });
    if (hasCustomDomain) {
      this.createDnsRecord({ domain, hostedZoneId });
    }

    this.registerOutputs();
  }

  private createTlsCertificate({
    domain,
    hostedZoneId,
  }: Pick<Required<StaticSiteArgs>, 'domain' | 'hostedZoneId'>) {
    const certificate = new AcmCertificate(
      `${domain}-acm-certificate`,
      {
        domain,
        hostedZoneId,
      },
      { parent: this },
    );
    return certificate;
  }

  private createPublicBucket({ tags }: Pick<StaticSiteArgs, 'tags'>) {
    const bucket = new aws.s3.Bucket(
      `${this.name}-bucket`,
      {
        bucketPrefix: `${this.name}-`,
        website: {
          indexDocument: 'index.html',
          errorDocument: 'index.html',
        },
        tags: { ...commonTags, ...tags },
      },
      { parent: this },
    );

    const bucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
      `${this.name}-bucket-access-block`,
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
      `${this.name}-bucket-policy`,
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

    return bucket;
  }

  private createCloudfrontDistribution({
    domain,
    viewerRequestFunctionArn,
    tags,
  }: Pick<StaticSiteArgs, 'domain' | 'viewerRequestFunctionArn' | 'tags'>) {
    const functionAssociations = viewerRequestFunctionArn
      ? [
          {
            eventType: 'viewer-request',
            functionArn: viewerRequestFunctionArn,
          },
        ]
      : [];

    const cloudfront = new aws.cloudfront.Distribution(
      `${this.name}-cloudfront`,
      {
        enabled: true,
        defaultRootObject: 'index.html',
        ...(domain && { aliases: [domain] }),
        isIpv6Enabled: true,
        waitForDeployment: true,
        httpVersion: 'http2and3',
        viewerCertificate: {
          ...(this.certificate
            ? {
                acmCertificateArn: this.certificate.certificate.arn,
                sslSupportMethod: 'sni-only',
                minimumProtocolVersion: 'TLSv1.2_2021',
              }
            : {
                cloudfrontDefaultCertificate: true,
              }),
        },
        origins: [
          {
            originId: this.bucket.arn,
            domainName: this.bucket.websiteEndpoint,
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
          targetOriginId: this.bucket.arn,
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
          functionAssociations,
        },
        priceClass: 'PriceClass_100',
        restrictions: {
          geoRestriction: { restrictionType: 'none' },
        },
        tags: { ...commonTags, ...tags },
      },
      { parent: this },
    );
    return cloudfront;
  }

  private createDnsRecord({
    domain,
    hostedZoneId,
  }: Pick<Required<StaticSiteArgs>, 'domain' | 'hostedZoneId'>) {
    const cdnAliasRecord = new aws.route53.Record(
      `${this.name}-cdn-route53-record`,
      {
        type: 'A',
        name: domain,
        zoneId: hostedZoneId,
        aliases: [
          {
            name: this.cloudfront.domainName,
            zoneId: this.cloudfront.hostedZoneId,
            evaluateTargetHealth: true,
          },
        ],
      },
      { parent: this },
    );
    return cdnAliasRecord;
  }
}
