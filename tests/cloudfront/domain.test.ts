import { it } from 'node:test';
import * as assert from 'node:assert';
import { ListResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { request } from 'undici';
import status from 'http-status';
import { CloudFrontTestContext } from './test-context';
import { backOff } from '../util';

export function testCloudFrontWithDomain(ctx: CloudFrontTestContext) {
  it('should create certificate when domain is provided', () => {
    const cf = ctx.outputs!.cfWithDomain;

    assert.ok(cf.acmCertificate, 'Certificate should be created');
  });

  it('should create alias record when domain is provided', async () => {
    const cf = ctx.outputs!.cfWithDomain;
    // Ensure FQDN, i.e., end with dot if not
    const domainName = ctx.config.domainName.replace(/([^.])$/, '$1.');

    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: ctx.config.hostedZoneId,
      MaxItems: 1000,
    });
    const response = await ctx.clients.route53.send(command);

    const record = response.ResourceRecordSets?.find(
      record => record.Name === domainName && record.Type === 'A',
    );

    assert.ok(record, 'Alias record should exists');
    assert.strictEqual(
      record.AliasTarget?.DNSName,
      `${cf.distribution.domainName}.`,
      'Alias record should target CF distribution',
    );
  });

  it('should configure viewer certificate when domain is provided', () => {
    const cf = ctx.outputs!.cfWithDomain;
    const { viewerCertificate } = cf.distribution;

    assert.strictEqual(
      viewerCertificate.acmCertificateArn,
      cf.acmCertificate?.certificate.arn,
      'Viewer certificate should match created certificate',
    );
    assert.strictEqual(
      viewerCertificate.sslSupportMethod,
      'sni-only',
      'Viewer certificate should have correct SSL supported method',
    );
    assert.strictEqual(
      viewerCertificate.minimumProtocolVersion,
      'TLSv1.2_2021',
      'Viewer certificate should have correct minimum protocol version',
    );
  });

  it('should configure aliases when domain is provided', () => {
    const cf = ctx.outputs!.cfWithDomain;

    assert.deepStrictEqual(
      cf.distribution.aliases,
      [ctx.config.domainName],
      'Aliases should be correctly configured',
    );
  });

  it('should have reachable distribution when domain is provided', async () => {
    const url = `https://${ctx.config.domainName}`;

    await backOff(async () => {
      const response = await request(url);

      assert.strictEqual(
        response.statusCode,
        status.OK,
        `Distribution should respond with status code 200, got ${response.statusCode}`,
      );
    });
  });
}
