import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { commonTags } from '../../shared/common-tags';

export namespace S3Assets {
  export type Args = {
    bucketPrefix?: pulumi.Input<string>;
    indexDocument?: pulumi.Input<string>;
    errorDocument?: pulumi.Input<string>;
    tags?: pulumi.Input<{
      [key: string]: pulumi.Input<string>;
    }>;
  };
}

export class S3Assets extends pulumi.ComponentResource {
  name: string;
  bucket: aws.s3.Bucket;
  websiteConfig: aws.s3.BucketWebsiteConfiguration;

  constructor(
    name: string,
    args: S3Assets.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:static-site:S3Assets', name, args, opts);

    this.name = name;

    const {
      bucketPrefix = `${this.name}-`,
      indexDocument = 'index.html',
      errorDocument = 'index.html',
      tags,
    } = args;
    const [bucket, websiteConfig] = this.createWebsiteBucket(
      bucketPrefix,
      indexDocument,
      errorDocument,
      tags,
    );

    this.bucket = bucket;
    this.websiteConfig = websiteConfig;
  }

  private setupWebsiteBucketAccess(bucket: aws.s3.Bucket): void {
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
    const policy = bucket.bucket.apply(getWebsiteBucketPolicy);

    new aws.s3.BucketPolicy(
      `${this.name}-bucket-policy`,
      {
        bucket: bucket.id,
        policy: policy.json,
      },
      { parent: this, dependsOn: [bucketPublicAccessBlock] },
    );
  }

  private createWebsiteBucket(
    bucketPrefix: Required<S3Assets.Args>['bucketPrefix'],
    indexDocument: Required<S3Assets.Args>['indexDocument'],
    errorDocument: Required<S3Assets.Args>['errorDocument'],
    tags?: S3Assets.Args['tags'],
  ): [aws.s3.Bucket, aws.s3.BucketWebsiteConfiguration] {
    const bucket = new aws.s3.Bucket(
      `${this.name}-bucket`,
      {
        bucketPrefix,
        tags: { ...commonTags, ...tags },
      },
      { parent: this },
    );
    const config = new aws.s3.BucketWebsiteConfiguration(
      `${this.name}-bucket-website-config`,
      {
        bucket: bucket.id,
        indexDocument: {
          suffix: indexDocument,
        },
        errorDocument: {
          key: errorDocument,
        },
      },
      { parent: this },
    );

    this.setupWebsiteBucketAccess(bucket);

    return [bucket, config];
  }
}

const getWebsiteBucketPolicy = (bucketName: string) =>
  aws.iam.getPolicyDocument({
    statements: [
      {
        effect: 'Allow',
        principals: [
          {
            type: '*',
            identifiers: ['*'],
          },
        ],
        actions: ['s3:GetObject'],
        resources: [`arn:aws:s3:::${bucketName}/*`],
      },
    ],
  });
