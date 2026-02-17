import * as aws from '@pulumi/aws-v7';
import * as pulumi from '@pulumi/pulumi';
import { commonTags } from '../../shared/common-tags';
import { AcmCertificate } from '../acm-certificate';
import { S3CacheStrategy } from './s3-cache-strategy';
import { LbCacheStrategy } from './lb-cache-strategy';

export class CloudFront extends pulumi.ComponentResource {
  name: string;
  distribution: aws.cloudfront.Distribution;
  acmCertificate?: AcmCertificate;

  constructor(
    name: string,
    args: CloudFront.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:cloudfront:CloudFront', name, args, opts);

    this.name = name;

    const { behaviors, domain, certificate, hostedZoneId, tags } = args;
    const hasCustomDomain = !!domain || !!certificate;

    if (hasCustomDomain && !hostedZoneId) {
      throw new Error(
        'Provide `hostedZoneId` alongside `domain` and/or `certificate`.',
      );
    }

    const defaultBehavior = behaviors.at(-1);
    const orderedBehaviors = behaviors.slice(0, -1);

    if (!defaultBehavior || !isDefaultBehavior(defaultBehavior)) {
      throw new Error('Default behavior must be placed last.');
    }

    if (domain && hostedZoneId && !certificate) {
      this.acmCertificate = this.createCertificate({ domain, hostedZoneId });
    }

    const defaultRootObject = isS3BehaviorType(defaultBehavior)
      ? 'index.html'
      : isCustomBehaviorType(defaultBehavior)
        ? defaultBehavior.defaultRootObject
        : undefined;

    this.distribution = this.createDistribution({
      origins: this.createDistributionOrigins(behaviors),
      defaultCache: this.getCacheBehavior(defaultBehavior),
      orderedCaches: orderedBehaviors.length
        ? orderedBehaviors.map((it, idx) => ({
            pathPattern: it.pathPattern,
            ...this.getCacheBehavior(it, idx),
          }))
        : undefined,
      domain,
      certificate:
        certificate || this.acmCertificate
          ? pulumi.output(certificate ?? this.acmCertificate!.certificate)
          : undefined,
      certificateValidation: this.acmCertificate
        ? this.acmCertificate.certificateValidation
        : undefined,
      defaultRootObject,
      tags,
    });

    if (hasCustomDomain && hostedZoneId) {
      this.createAliasRecord({ hostedZoneId });
    }

    this.registerOutputs();
  }

  private createDistributionOrigins(
    behaviors: CloudFront.Args['behaviors'],
  ): pulumi.Output<aws.types.input.cloudfront.DistributionOrigin[]> {
    return pulumi.output(behaviors).apply(entries => {
      const origins = entries.map(it => {
        if (isS3BehaviorType(it)) {
          return getOriginWithDefaults({
            originId: it.bucket.arn,
            domainName: it.websiteConfig.websiteEndpoint,
            customOriginConfig: {
              originProtocolPolicy: 'http-only',
            },
          });
        } else if (isLbBehaviorType(it)) {
          return getOriginWithDefaults({
            originId: it.loadBalancer.arn,
            domainName: it.dnsName ?? it.loadBalancer.dnsName,
          });
        } else if (isCustomBehaviorType(it)) {
          return getOriginWithDefaults({
            originId: it.originId,
            domainName: it.domainName,
            customOriginConfig: {
              ...(it.originProtocolPolicy
                ? { originProtocolPolicy: it.originProtocolPolicy }
                : undefined),
            },
          });
        } else {
          throw new Error(
            'Unknown CloudFront behavior encountered during mapping to distribution origins.',
          );
        }
      });

      // Remove duplicates, keeps the last occurrence of the origin
      return [...new Map(origins.map(it => [it.originId, it])).values()];
    });
  }

  private getCacheBehavior(
    behavior: CloudFront.Behavior,
    order?: number,
  ): aws.types.input.cloudfront.DistributionDefaultCacheBehavior {
    const isDefault = isDefaultBehavior(behavior);
    const getStrategyName = (backend: string) => {
      const suffix = isDefault ? 'default' : `ordered-${order}`;

      return `${this.name}-${backend}-cache-strategy-${suffix}`;
    };

    if (isS3BehaviorType(behavior)) {
      const strategy = new S3CacheStrategy(
        getStrategyName('s3'),
        {
          pathPattern: behavior.pathPattern,
          bucket: behavior.bucket,
          cacheTtl: behavior.cacheTtl,
        },
        { parent: this },
      );

      return strategy.config;
    } else if (isLbBehaviorType(behavior)) {
      const strategy = new LbCacheStrategy(
        getStrategyName('lb'),
        {
          pathPattern: behavior.pathPattern,
          loadBalancer: behavior.loadBalancer,
        },
        { parent: this },
      );

      return strategy.config;
    } else if (isCustomBehaviorType(behavior)) {
      return {
        targetOriginId: behavior.originId,
        allowedMethods: behavior.allowedMethods ?? [
          'GET',
          'HEAD',
          'OPTIONS',
          'PUT',
          'POST',
          'PATCH',
          'DELETE',
        ],
        cachedMethods: behavior.cachedMethods ?? ['GET', 'HEAD'],
        ...(behavior.compress != null && { compress: behavior.compress }),
        viewerProtocolPolicy: 'redirect-to-https',
        cachePolicyId:
          behavior.cachePolicyId ??
          aws.cloudfront
            .getCachePolicyOutput({ name: 'Managed-CachingDisabled' })
            .apply(p => p.id!),
        originRequestPolicyId:
          behavior.originRequestPolicyId ??
          aws.cloudfront
            .getOriginRequestPolicyOutput({
              name: 'Managed-AllViewerExceptHostHeader',
            })
            .apply(p => p.id!),
        responseHeadersPolicyId:
          behavior.responseHeadersPolicyId ??
          aws.cloudfront
            .getResponseHeadersPolicyOutput({
              name: 'Managed-SecurityHeadersPolicy',
            })
            .apply(p => p.id),
      };
    } else {
      throw new Error(
        'Unknown CloudFront behavior encountered during mapping to distribution cache behaviors.',
      );
    }
  }

  private createCertificate({
    domain,
    hostedZoneId,
  }: Required<
    Pick<CloudFront.Args, 'domain' | 'hostedZoneId'>
  >): AcmCertificate {
    return new AcmCertificate(
      `${domain}-acm-certificate`,
      {
        domain,
        hostedZoneId,
        region: 'us-east-1', // CF requires certificates to be in this region
      },
      { parent: this },
    );
  }

  private createDistribution({
    origins,
    defaultCache,
    orderedCaches,
    domain,
    certificate,
    certificateValidation,
    defaultRootObject,
    tags,
  }: CreateDistributionArgs): aws.cloudfront.Distribution {
    return new aws.cloudfront.Distribution(
      `${this.name}-distribution`,
      {
        enabled: true,
        isIpv6Enabled: true,
        waitForDeployment: true,
        httpVersion: 'http2and3',
        ...(defaultRootObject && { defaultRootObject }),
        ...(certificate
          ? {
              aliases: domain
                ? [domain]
                : pulumi
                    .all([
                      certificate.domainName,
                      certificate.subjectAlternativeNames,
                    ])
                    .apply(([dn, sans = []]) => [...new Set([dn, ...sans])]),
              viewerCertificate: {
                acmCertificateArn: certificate.arn,
                sslSupportMethod: 'sni-only',
                minimumProtocolVersion: 'TLSv1.2_2021',
              },
            }
          : {
              viewerCertificate: {
                cloudfrontDefaultCertificate: true,
              },
            }),
        origins,
        defaultCacheBehavior: defaultCache,
        ...(orderedCaches && { orderedCacheBehaviors: orderedCaches }),
        priceClass: 'PriceClass_100',
        restrictions: {
          geoRestriction: { restrictionType: 'none' },
        },
        tags: { ...commonTags, ...tags },
      },
      {
        parent: this,
        aliases: [{ name: `${this.name}-cloudfront` }],
        ...(certificateValidation
          ? { dependsOn: [certificateValidation] }
          : undefined),
      },
    );
  }

  private createAliasRecord({
    hostedZoneId,
  }: Pick<Required<CloudFront.Args>, 'hostedZoneId'>) {
    return this.distribution.aliases.apply(aliases =>
      aliases?.map(
        (alias, index) =>
          new aws.route53.Record(
            `${this.name}-cloudfront-alias-record-${index}`,
            {
              type: 'A',
              name: alias,
              zoneId: hostedZoneId,
              aliases: [
                {
                  name: this.distribution.domainName,
                  zoneId: this.distribution.hostedZoneId,
                  evaluateTargetHealth: true,
                },
              ],
            },
            {
              parent: this,
              aliases: [{ name: `${this.name}-cdn-route53-record` }],
            },
          ),
      ),
    );
  }
}

export namespace CloudFront {
  export enum BehaviorType {
    S3 = 's3',
    LB = 'lb',
    CUSTOM = 'custom',
  }

  export type S3Behavior = BehaviorBase & {
    type: BehaviorType.S3;
    bucket: pulumi.Input<aws.s3.Bucket>;
    websiteConfig: pulumi.Input<aws.s3.BucketWebsiteConfiguration>;
    /**
     * Override TTLs of the default cache policy. Suitable when more control is
     * needed to set up unified TTL on the default cache policy.
     */
    cacheTtl?: pulumi.Input<number>;
  };

  export type LbBehavior = BehaviorBase & {
    type: BehaviorType.LB;
    loadBalancer: pulumi.Input<aws.lb.LoadBalancer>;
    /*
     * Override for autogenerated load balancer DNS name. Suitable when load
     * balancer is associated with custom domain name covered by certificate.
     */
    dnsName?: pulumi.Input<string>;
  };

  export type CustomBehavior = BehaviorBase & {
    type: BehaviorType.CUSTOM;
    originId: pulumi.Input<string>;
    domainName: pulumi.Input<string>;
    originProtocolPolicy?: pulumi.Input<string>;
    allowedMethods?: pulumi.Input<pulumi.Input<string>[]>;
    cachedMethods?: pulumi.Input<pulumi.Input<string>[]>;
    compress?: pulumi.Input<boolean>;
    defaultRootObject?: pulumi.Input<string>;
    cachePolicyId?: pulumi.Input<string>;
    originRequestPolicyId?: pulumi.Input<string>;
    responseHeadersPolicyId?: pulumi.Input<string>;
  };

  export type Behavior = S3Behavior | LbBehavior | CustomBehavior;

  export type Args = {
    /**
     * Behavior is a combination of distribution's origin and cache behavior.
     * Ordering is important since first encountered behavior is applied,
     * matched by path.
     * The default behavior, i.e. path pattern `*` or `/*`, must always be last.
     * Mapping between behavior and cache is one to one, while origin is mapped
     * by ID to filter out duplicates while keeping the last occurrence.
     */
    behaviors: Behavior[];
    /**
     * Domain name for CloudFront distribution. Implies creation of certificate
     * and alias record. Must belong to the provided hosted zone.
     * Providing the `certificate` argument has following effects:
     * - Certificate creation is skipped
     * - Provided certificate must cover the domain name
     * Responsibility to ensure mentioned requirements in on the consumer, and
     * falling to do so will result in unexpected behavior.
     */
    domain?: pulumi.Input<string>;
    /**
     * Certificate for CloudFront distribution. Domain and alternative domains
     * are automatically pulled from the certificate and translated into alias
     * records. Domains covered by the certificate, must belong to the provided
     * hosted zone. The certificate must be in `us-east-1` region. In a case
     * of wildcard certificate the `domain` argument is required.
     * Providing the `domain` argument has following effects:
     * - Alias records creation, from automatically pulled domains, is skipped
     * - Certificate must cover the provided domain name
     * Responsibility to ensure mentioned requirements in on the consumer, and
     * falling to do so will result in unexpected behavior.
     */
    certificate?: pulumi.Input<aws.acm.Certificate>;
    /**
     * ID of hosted zone is needed when the `domain` or the `certificate`
     * arguments are provided.
     */
    hostedZoneId?: pulumi.Input<string>;
    tags?: pulumi.Input<{
      [key: string]: pulumi.Input<string>;
    }>;
  };

  type BehaviorBase = {
    pathPattern: string;
  };
}

type CreateDistributionArgs = {
  origins: pulumi.Output<aws.types.input.cloudfront.DistributionOrigin[]>;
  defaultCache: aws.types.input.cloudfront.DistributionDefaultCacheBehavior;
  orderedCaches?: aws.types.input.cloudfront.DistributionOrderedCacheBehavior[];
  domain?: pulumi.Input<string>;
  certificate?: pulumi.Output<aws.acm.Certificate>;
  certificateValidation?: pulumi.Output<aws.acm.CertificateValidation>;
  defaultRootObject?: pulumi.Input<string>;
  tags: CloudFront.Args['tags'];
};

function isDefaultBehavior(value: CloudFront.Behavior) {
  return value.pathPattern === '*' || value.pathPattern === '/*';
}

function isS3BehaviorType(
  value: CloudFront.Behavior,
): value is CloudFront.S3Behavior {
  return value.type === CloudFront.BehaviorType.S3;
}

function isLbBehaviorType(
  value: CloudFront.Behavior,
): value is CloudFront.LbBehavior {
  return value.type === CloudFront.BehaviorType.LB;
}

function isCustomBehaviorType(
  value: CloudFront.Behavior,
): value is CloudFront.CustomBehavior {
  return value.type === CloudFront.BehaviorType.CUSTOM;
}

function getOriginWithDefaults({
  originId,
  domainName,
  customOriginConfig,
}: Pick<
  aws.types.input.cloudfront.DistributionOrigin,
  'originId' | 'domainName'
> & {
  customOriginConfig?: Partial<
    aws.types.input.cloudfront.DistributionOrigin['customOriginConfig']
  >;
}): aws.types.input.cloudfront.DistributionOrigin {
  return {
    originId,
    domainName,
    customOriginConfig: {
      originProtocolPolicy: 'https-only',
      httpPort: 80,
      httpsPort: 443,
      originSslProtocols: ['TLSv1.2'],
      ...customOriginConfig,
    },
  };
}
