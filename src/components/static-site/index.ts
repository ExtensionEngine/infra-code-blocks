import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { CacheRuleTtl, parseCacheRuleTtl } from './cache-rule-ttl';
import { S3Assets } from './s3-assets';
import { CloudFront } from '../cloudfront';

export namespace StaticSite {
  export type CacheRule = {
    pathPattern: string;
    /**
     * The TTL to for the path pattern.
     * Available predefined options are:
     * - `default` (fallback to defaults for CloudFront S3 behavior)
     * - `off` (0 second)
     * - `minute` (60 seconds)
     * - `hour` (3600 seconds)
     * - `day` (86400 seconds)
     * - `week` (604800 seconds)
     * - `month` (2592000 seconds)
     */
    ttl: CacheRuleTtl;
  };

  export type Args = {
    /*
     * The domain name for the static site.
     * @see CloudFront.Args.domain
     */
    domain?: pulumi.Input<string>;
    /*
     * The certificate for the static site.
     * @see CloudFront.Args.certificate.
     */
    certificate?: pulumi.Input<aws.acm.Certificate>;
    hostedZoneId: pulumi.Input<string>;
    indexDocument?: pulumi.Input<string>;
    errorDocument?: pulumi.Input<string>;
    /**
     * Caching to enforce for S3 assets. Combined with S3 bucket translates
     * into CloudFront behaviors.
     * The default cache rule, i.e. path pattern `*` or `/*`, must always be last.
     * @see CloudFront.Args.behaviors
     */
    cacheRules?: CacheRule[];
    tags?: pulumi.Input<{
      [key: string]: pulumi.Input<string>;
    }>;
  };
}

export class StaticSite extends pulumi.ComponentResource {
  name: string;
  s3Assets: S3Assets;
  cf: CloudFront;

  constructor(
    name: string,
    args: StaticSite.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:static-site:StaticSite', name, args, {
      ...opts,
      aliases: [...(opts.aliases || []), { type: 'studion:StaticSite' }],
    });

    const {
      domain,
      hostedZoneId,
      certificate,
      indexDocument,
      errorDocument,
      cacheRules,
      tags,
    } = args;

    if (!domain && !certificate) {
      throw new Error('Provide either domain or certificate, or both');
    }

    this.name = name;
    this.s3Assets = new S3Assets(
      `${this.name}-s3-assets`,
      { indexDocument, errorDocument, tags },
      { parent: this },
    );
    this.cf = new CloudFront(
      `${this.name}-cf`,
      {
        behaviors: this.getCloudFrontBehaviors(cacheRules),
        domain,
        certificate,
        hostedZoneId,
        tags,
      },
      { parent: this },
    );
  }

  private getCloudFrontBehaviors(
    cacheRules: StaticSite.Args['cacheRules'],
  ): CloudFront.Behavior[] {
    if (!cacheRules) {
      return [
        {
          type: CloudFront.BehaviorType.S3,
          pathPattern: '*',
          bucket: this.s3Assets.bucket,
          websiteConfig: this.s3Assets.websiteConfig,
        },
      ];
    }

    return cacheRules.map(rule => ({
      type: CloudFront.BehaviorType.S3,
      pathPattern: rule.pathPattern,
      bucket: this.s3Assets.bucket,
      websiteConfig: this.s3Assets.websiteConfig,
      cacheTtl: parseCacheRuleTtl(rule.ttl),
    }));
  }
}
