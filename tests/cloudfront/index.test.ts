import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { Unwrap } from '@pulumi/pulumi';
import { InlineProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import {
  CloudFrontClient,
  GetDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import { Route53Client } from '@aws-sdk/client-route-53';
import { request } from 'undici';
import status from 'http-status';
import * as automation from '../automation';
import { backOff, requireEnv, unwrapOutputs } from '../util';
import { CloudFrontTestContext, ProgramOutput } from './test-context';
import * as infraConfig from './infrastructure/config';
import { testCloudFrontWithDomain } from './domain.test';
import { testCloudFrontWithCertificate } from './certificate.test';
import { testCloudFrontWithVariousBehaviors } from './various-behaviors.test';

requireEnv('ICB_DOMAIN_NAME');

const hostedZoneId = requireEnv('ICB_HOSTED_ZONE_ID');
const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-cloudfront',
  program: () => import('./infrastructure'),
};

const ctx: CloudFrontTestContext = {
  config: {
    hostedZoneId,
    defaultDomain: infraConfig.defaultDomain,
    certificateDomain: infraConfig.certificateDomain,
    certificateSANs: infraConfig.certificateSANs,
    loadBalancerDomain: infraConfig.loadBalancerDomain,
    cfMinimalName: infraConfig.cfMinimalName,
    cfMinimalOriginId: infraConfig.cfMinimalOriginId,
    cfMinimalOriginProtocolPolicy: infraConfig.cfMinimalOriginProtocolPolicy,
    cfMinimalDefaultRootObject: infraConfig.cfMinimalDefaultRootObject,
    cfWithVariousBehaviorsLbPathPattern:
      infraConfig.cfWithVariousBehaviorsLbPathPattern,
    cfWithVariousBehaviorsS3PathPattern:
      infraConfig.cfWithVariousBehaviorsS3PathPattern,
    cfWithVariousBehaviorsS3TtlPathPattern:
      infraConfig.cfWithVariousBehaviorsS3TtlPathPattern,
    cfWithVariousBehaviorsCustomOriginProtocolPolicy:
      infraConfig.cfWithVariousBehaviorsCustomOriginProtocolPolicy,
    cfWithVariousBehaviorsCustomDefaultRootObject:
      infraConfig.cfWithVariousBehaviorsCustomDefaultRootObject,
    cfWithVariousBehaviorsCustomAllowedMethods:
      infraConfig.cfWithVariousBehaviorsCustomAllowedMethods,
    cfWithVariousBehaviorsCustomCompress:
      infraConfig.cfWithVariousBehaviorsCustomCompress,
  },
  clients: {
    cf: new CloudFrontClient(),
    route53: new Route53Client(),
  },
};

describe('CloudFront component deployment', () => {
  before(async () => {
    const outputs: OutputMap = await automation.deploy(programArgs);

    ctx.outputs = unwrapOutputs<ProgramOutput>(outputs);
  });

  after(() => automation.destroy(programArgs));

  it('should create CloudFront component with the correct configuration', () => {
    const cf = ctx.outputs!.cfMinimal;

    assert.ok(cf, 'CloudFront component should be defined');
    assert.strictEqual(
      cf.name,
      ctx.config.cfMinimalName,
      'CloudFront component should have correct name',
    );
  });

  it('should create distribution with the correct configuration', () => {
    const cf = ctx.outputs!.cfMinimal;

    assert.ok(cf.distribution, 'Distribution should be defined');
    assert.strictEqual(
      cf.distribution.origins.length,
      1,
      'Distribution should have one origin',
    );
    assert.deepStrictEqual(
      cf.distribution.orderedCacheBehaviors,
      [],
      'Distribution should not have ordered cache behaviors',
    );
  });

  it('should create distribution with correct default root object', () => {
    const cf = ctx.outputs!.cfMinimal;

    assert.strictEqual(
      cf.distribution.defaultRootObject,
      ctx.config.cfMinimalDefaultRootObject,
      'Distribution should have correct default root object',
    );
  });

  it('should create distribution with correct tags', () => {
    const cf = ctx.outputs!.cfMinimal;

    assert.deepStrictEqual(
      cf.distribution.tags,
      {
        Project: 'icb-test-cloudfront',
        Env: 'dev',
        Application: 'cloudfront-test',
        Name: ctx.config.cfMinimalName,
      },
      'Distribution should have correct tags',
    );
  });

  it('should have deployed distribution with domain name', async () => {
    const cf = ctx.outputs!.cfMinimal;
    const { id } = cf.distribution;
    const Id = id as unknown as Unwrap<typeof id>;

    const command = new GetDistributionCommand({ Id });
    const response = await ctx.clients.cf.send(command);
    const distribution = response.Distribution;

    assert.ok(distribution, 'Distribution should exist in AWS');
    assert.ok(distribution.DomainName, 'Distribution should have domain name');
    assert.strictEqual(
      distribution.Status,
      'Deployed',
      'Distribution should have deployed status',
    );
  });

  it('should have distribution that responds to requests', async () => {
    const cf = ctx.outputs!.cfMinimal;
    const url = `https://${cf.distribution.domainName}`;

    await backOff(async () => {
      const response = await request(url);

      assert.strictEqual(
        response.statusCode,
        status.OK,
        `Distribution should respond with status code 200, got ${response.statusCode}`,
      );
    });
  });

  it('should create origin with correct ID and domain name', () => {
    const cf = ctx.outputs!.cfMinimal;
    const domainName = ctx.outputs!.cfMinimalOriginDomainName;
    const { origins } = cf.distribution;
    const [origin] = origins as unknown as Unwrap<typeof origins>;

    assert.strictEqual(
      origin.originId,
      ctx.config.cfMinimalOriginId,
      'Origin should have correct ID',
    );
    assert.strictEqual(
      origin.domainName,
      domainName,
      'Origin should have correct domain name',
    );
  });

  it('should create origin with correct protocol policy', () => {
    const cf = ctx.outputs!.cfMinimal;
    const { origins } = cf.distribution;
    const [origin] = origins as unknown as Unwrap<typeof origins>;

    assert.strictEqual(
      origin.customOriginConfig?.originProtocolPolicy,
      ctx.config.cfMinimalOriginProtocolPolicy,
      'Origin should have correct protocol policy',
    );
  });

  it('should create origin with default HTTP(S) ports', () => {
    const cf = ctx.outputs!.cfMinimal;
    const { origins } = cf.distribution;
    const [origin] = origins as unknown as Unwrap<typeof origins>;

    assert.strictEqual(
      origin.customOriginConfig?.httpPort,
      80,
      'Should create origin with default HTTP port',
    );
    assert.strictEqual(
      origin.customOriginConfig?.httpsPort,
      443,
      'Should create origin with default HTTPS port',
    );
  });

  it('should create origin with default minimum SSL protocol', () => {
    const cf = ctx.outputs!.cfMinimal;
    const { origins } = cf.distribution;
    const [origin] = origins as unknown as Unwrap<typeof origins>;

    assert.deepStrictEqual(origin.customOriginConfig?.originSslProtocols, [
      'TLSv1.2',
    ]);
  });

  it('should create default cache behavior with correct target origin ID', () => {
    const cf = ctx.outputs!.cfMinimal;
    const { defaultCacheBehavior } = cf.distribution;

    assert.strictEqual(
      defaultCacheBehavior.targetOriginId,
      ctx.config.cfMinimalOriginId,
      'Default cache behavior should have correct target origin ID',
    );
  });

  it('should create default cache behavior with default allowed and cached methods', () => {
    const cf = ctx.outputs!.cfMinimal;
    const { defaultCacheBehavior } = cf.distribution;

    assert.deepStrictEqual(
      defaultCacheBehavior.allowedMethods,
      ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
      'Default cache behavior should have correct allowed methods',
    );
    assert.deepStrictEqual(
      defaultCacheBehavior.cachedMethods,
      ['GET', 'HEAD'],
      'Default cache behavior should have correct cached methods',
    );
  });

  it('should create default cache behavior with default viewer protocol policy', () => {
    const cf = ctx.outputs!.cfMinimal;
    const { defaultCacheBehavior } = cf.distribution;

    assert.strictEqual(
      defaultCacheBehavior.viewerProtocolPolicy,
      'redirect-to-https',
      'Default cache behavior should have correct viewer protocol policy',
    );
  });

  it('should create default cache behavior with default managed policies IDs', () => {
    const cf = ctx.outputs!.cfMinimal;
    const { defaultCacheBehavior } = cf.distribution;

    assert.strictEqual(
      defaultCacheBehavior.cachePolicyId,
      '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
      'Default cache behavior should have correct cache policy ID',
    );
    assert.strictEqual(
      defaultCacheBehavior.originRequestPolicyId,
      'b689b0a8-53d0-40ab-baf2-68738e2966ac',
      'Default cache behavior should have correct origin request policy ID',
    );
    assert.strictEqual(
      defaultCacheBehavior.responseHeadersPolicyId,
      '67f7725c-6f97-4210-82d7-5512b31e9d03',
      'Default cache behavior should have correct response headers policy ID',
    );
  });

  it('should create viewer certificate with default certificate', () => {
    const cf = ctx.outputs!.cfMinimal;
    const { viewerCertificate } = cf.distribution;

    assert.ok(
      viewerCertificate.cloudfrontDefaultCertificate,
      'Viewer certificate should be a default CloudFront certificate',
    );
  });

  describe('With domain', () => testCloudFrontWithDomain(ctx));

  describe('With certificate', () => testCloudFrontWithCertificate(ctx));

  describe('With various behaviors', () =>
    testCloudFrontWithVariousBehaviors(ctx));
});
