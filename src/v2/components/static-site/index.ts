import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws-v7';
import { S3Assets } from './s3-assets';
import { CloudFront } from '../cloudfront';

export namespace StaticSite {
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
    super('studion:ss:StaticSite', name, args, {
      ...opts,
      aliases: [...(opts.aliases || []), { type: 'studion:StaticSite' }],
    });

    const {
      domain,
      hostedZoneId,
      certificate,
      indexDocument,
      errorDocument,
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
        behaviors: [
          {
            type: CloudFront.BehaviorType.S3,
            pathPattern: '*',
            bucket: this.s3Assets.bucket,
            websiteConfig: this.s3Assets.websiteConfig,
          },
        ],
        domain,
        certificate,
        hostedZoneId,
        tags,
      },
      { parent: this },
    );
  }
}
