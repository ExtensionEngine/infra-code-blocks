import * as fs from 'node:fs';
import * as path from 'node:path';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import mime from 'mime';
import * as studion from '@studion/infra-code-blocks';

export namespace OriginFactory {
  export type Args = {
    namePrefix: string;
    parent: pulumi.ComponentResource;
    tags: {
      [key: string]: string;
    };
  };
}

export class OriginFactory {
  private readonly stackName;
  private readonly namePrefix;
  private readonly parent;
  private readonly tags;

  constructor(args: OriginFactory.Args) {
    this.stackName = pulumi.getStack();
    this.namePrefix = args.namePrefix;
    this.parent = args.parent;
    this.tags = args.tags;
  }

  getWebsiteBucket(
    id: string,
    prefix?: string,
  ): [aws.s3.Bucket, aws.s3.BucketWebsiteConfiguration] {
    const name = `${this.namePrefix}-${id}-bucket`;
    const bucket = new aws.s3.Bucket(
      name,
      { tags: this.tags },
      { parent: this.parent },
    );
    const config = new aws.s3.BucketWebsiteConfiguration(
      `${name}-website-config`,
      {
        bucket: bucket.id,
        indexDocument: {
          suffix: 'index.html',
        },
        errorDocument: {
          key: 'error.html',
        },
      },
      { parent: this.parent },
    );

    const bucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
      `${name}-access-block`,
      {
        bucket: bucket.id,
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      { parent: this.parent },
    );

    const policy = bucket.bucket.apply(bucketName =>
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
      }),
    );

    new aws.s3.BucketPolicy(
      `${name}-policy`,
      {
        bucket: bucket.id,
        policy: policy.json,
      },
      { parent: this.parent, dependsOn: [bucketPublicAccessBlock] },
    );

    this.uploadAssets(name, bucket, prefix);

    return [bucket, config];
  }

  getLoadBalancer(
    id: string,
    vpc: pulumi.Input<awsx.ec2.Vpc>,
    domainName: string,
    hostedZoneId: pulumi.Input<string>,
  ): aws.lb.LoadBalancer {
    const name = `${this.namePrefix}-${id}`;
    const cluster = new aws.ecs.Cluster(
      `${name}-cluster`,
      {
        name: `${this.namePrefix}-cluster-${this.stackName}`,
        tags: this.tags,
      },
      { parent: this.parent },
    );

    const webServer = new studion.WebServerBuilder(name)
      .configureWebServer('nginxdemos/nginx-hello:plain-text', 8080)
      .configureEcs({
        cluster,
        desiredCount: 1,
        size: 'small',
        autoscaling: { enabled: false },
        tags: this.tags,
      })
      .withCustomDomain(domainName, hostedZoneId)
      .withVpc(vpc)
      .build({ parent: cluster });

    return webServer.lb.lb;
  }

  private uploadAssets(
    name: string,
    bucket: aws.s3.Bucket,
    prefix: string = '',
  ) {
    const dir = path.join(
      process.cwd(),
      './tests/cloudfront/infrastructure/assets',
    );
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = `${dir}/${file}`;
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        continue;
      }

      new aws.s3.BucketObject(
        `${name}-${file}`,
        {
          key: `${prefix}${file}`,
          bucket: bucket.id,
          contentType: mime.getType(file) || undefined,
          source: new pulumi.asset.FileAsset(filePath),
        },
        { parent: bucket },
      );
    }
  }
}
