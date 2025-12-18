import { it } from 'node:test';
import * as assert from 'node:assert';
import { ListResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { request } from 'undici';
import status from 'http-status';
import { CloudFrontTestContext } from './test-context';
import { backOff } from '../util';

export function testCloudFrontWithCertificate(ctx: CloudFrontTestContext) {
  it('should not create certificate when certificate is provided', () => {
    const cf = ctx.outputs!.cfWithCertificate;

    assert.ok(
      cf.acmCertificate === undefined,
      'Certificate should not be created',
    );
  });

  it('should create alias record(s) when certificate is provided', async () => {
    const cf = ctx.outputs!.cfWithCertificate;
    // Ensure FQDN, i.e., end with dot if not
    const fqdn = (name: string) => name.replace(/([^.])$/, '$1.');
    const domainName = fqdn(ctx.config.certificateDomain);
    const sans = ctx.config.certificateSANs.map(fqdn);

    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: ctx.config.hostedZoneId,
      MaxItems: 1000,
    });
    const response = await ctx.clients.route53.send(command);
    const domainRecord = response.ResourceRecordSets?.find(
      record => record.Name === domainName && record.Type === 'A',
    );
    const sanRecords = response.ResourceRecordSets?.filter(
      record => sans.includes(record.Name!) && record.Type === 'A',
    );

    assert.ok(domainRecord, 'Alias domain record should exists');
    assert.ok(
      sanRecords?.length === sans.length,
      'Alias SAN records should exists',
    );

    assert.strictEqual(
      domainRecord.AliasTarget?.DNSName,
      `${cf.distribution.domainName}.`,
      'Alias domain record should target CF distribution',
    );
  });

  it('should configure viewer certificate when certificate is provided', () => {
    const cf = ctx.outputs!.cfWithCertificate;
    const certificate = ctx.outputs!.certificate;
    const { viewerCertificate } = cf.distribution;

    assert.strictEqual(
      viewerCertificate.acmCertificateArn,
      certificate.certificate.arn,
      'Viewer certificate should match provided certificate',
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

  it('should configure aliases when certificate is provided', () => {
    const cf = ctx.outputs!.cfWithCertificate;

    assert.deepStrictEqual(
      cf.distribution.aliases,
      [ctx.config.certificateDomain, ...ctx.config.certificateSANs].sort(),
      'Aliases should be correctly configured',
    );
  });

  it('should have reachable distribution when certificate is provided', async () => {
    const url = `https://${ctx.config.certificateDomain}`;

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
