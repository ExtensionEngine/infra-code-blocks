import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { Unwrap } from '@pulumi/pulumi';
import { InlineProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import {
  GetBucketPolicyCommand,
  GetBucketWebsiteCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { request } from 'undici';
import status from 'http-status';
import * as automation from '../automation';
import { backOff, requireEnv, unwrapOutputs } from '../util';
import { StaticSiteTestContext, ProgramOutput } from './test-context';
import * as infraConfig from './infrastructure/config';
import {
  CloudFrontClient,
  GetDistributionCommand,
} from '@aws-sdk/client-cloudfront';

requireEnv('ICB_DOMAIN_NAME');
requireEnv('ICB_HOSTED_ZONE_ID');

const region = requireEnv('AWS_REGION');

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-static-site',
  program: () => import('./infrastructure'),
};

const ctx: StaticSiteTestContext = {
  config: {
    staticSiteName: infraConfig.staticSiteName,
    staticSiteDomain: infraConfig.staticSiteDomain,
  },
  clients: {
    cf: new CloudFrontClient(),
    s3: new S3Client({ region }),
  },
};

describe('StaticSite component deployment', () => {
  before(async () => {
    const outputs: OutputMap = await automation.deploy(programArgs);

    ctx.outputs = unwrapOutputs<ProgramOutput>(outputs);
  });

  after(() => automation.destroy(programArgs));

  it('should create StaticSite component with the correct configuration', () => {
    const staticSite = ctx.outputs!.staticSite;

    assert.ok(staticSite, 'StaticSite component should be defined');
    assert.strictEqual(
      staticSite.name,
      ctx.config.staticSiteName,
      'StaticSite component should have correct name',
    );
  });

  it('should create CloudFront distribution', async () => {
    const staticSite = ctx.outputs!.staticSite;

    assert.ok(
      staticSite.cf && staticSite.cf.distribution,
      'CloudFront distribution should be created',
    );

    const { id } = staticSite.cf.distribution;
    const Id = id as unknown as Unwrap<typeof id>;

    const command = new GetDistributionCommand({ Id });
    const response = await ctx.clients.cf.send(command);
    const distribution = response.Distribution;

    assert.ok(distribution, 'CloudFront distribution should exist in AWS');
  });

  it('should create CloudFront distribution with correct tags', () => {
    const staticSite = ctx.outputs!.staticSite;

    assert.deepStrictEqual(
      staticSite.cf.distribution.tags,
      {
        Project: 'icb-test-static-site',
        Env: 'dev',
        Application: 'static-site-test',
        Prefix: ctx.config.staticSiteName,
      },
      'Distribution should have correct tags',
    );
  });

  it('should create S3 website bucket', async () => {
    const staticSite = ctx.outputs!.staticSite;

    assert.ok(
      staticSite.s3Assets &&
        staticSite.s3Assets.bucket &&
        staticSite.s3Assets.websiteConfig,
      'S3 website bucket should be created',
    );

    const bucket = staticSite.s3Assets.bucket;
    const arn = bucket.arn as unknown as Unwrap<typeof bucket.arn>;
    const command = new ListBucketsCommand();
    const response = await ctx.clients.s3.send(command);

    const responseBucket = response.Buckets?.find(
      bucket => bucket.BucketArn === arn,
    );

    assert.ok(responseBucket, 'Bucket should exists in AWS');
  });

  it('should create S3 website bucket with correct website configuration', async () => {
    const staticSite = ctx.outputs!.staticSite;
    const bucket = staticSite.s3Assets.bucket.bucket;
    const Bucket = bucket as unknown as Unwrap<typeof bucket>;

    const command = new GetBucketWebsiteCommand({ Bucket });
    const response = await ctx.clients.s3.send(command);

    assert.ok(
      response.IndexDocument && response.ErrorDocument,
      'Bucket website configuration should exists in AWS',
    );
    assert.strictEqual(
      response.IndexDocument.Suffix,
      'index.html',
      'Default index document should equal index.html',
    );
    assert.strictEqual(
      response.ErrorDocument.Key,
      'index.html',
      'Default error document should equal index.html',
    );
  });

  it('should create S3 website bucket with correct public access block', async () => {
    const staticSite = ctx.outputs!.staticSite;
    const bucket = staticSite.s3Assets.bucket.bucket;
    const Bucket = bucket as unknown as Unwrap<typeof bucket>;

    const command = new GetPublicAccessBlockCommand({ Bucket });
    const response = await ctx.clients.s3.send(command);

    assert.deepStrictEqual(
      response.PublicAccessBlockConfiguration,
      {
        BlockPublicAcls: false,
        BlockPublicPolicy: false,
        IgnorePublicAcls: false,
        RestrictPublicBuckets: false,
      },
      'Bucket public access block should be correctly configured',
    );
  });

  it('should create S3 website bucket with correct policy', async () => {
    const staticSite = ctx.outputs!.staticSite;
    const bucket = staticSite.s3Assets.bucket.bucket;
    const Bucket = bucket as unknown as Unwrap<typeof bucket>;

    const command = new GetBucketPolicyCommand({ Bucket });
    const response = await ctx.clients.s3.send(command);

    assert.ok(response.Policy, 'Bucket policy should be defined');

    const policyJson = JSON.parse(response.Policy);

    assert.partialDeepStrictEqual(
      policyJson,
      {
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${Bucket}/*`,
          },
        ],
      },
      'Bucket policy should be correctly configured',
    );
  });

  it('should create S3 website bucket with correct tags', () => {
    const staticSite = ctx.outputs!.staticSite;

    assert.deepStrictEqual(
      staticSite.s3Assets.bucket.tags,
      {
        Project: 'icb-test-static-site',
        Env: 'dev',
        Application: 'static-site-test',
        Prefix: ctx.config.staticSiteName,
      },
      'Distribution should have correct tags',
    );
  });

  it('should have deployed site that responds to requests', async () => {
    const url = `https://${ctx.config.staticSiteDomain}`;

    await backOff(async () => {
      const response = await request(url);

      assert.strictEqual(
        response.statusCode,
        status.OK,
        `Static site should respond with status code 200, got ${response.statusCode}`,
      );
    });
  });
});
