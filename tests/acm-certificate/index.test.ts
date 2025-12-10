import * as assert from 'node:assert';
import * as automation from '../automation';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import { ACMClient } from '@aws-sdk/client-acm';
import { Route53Client } from '@aws-sdk/client-route-53';
import { backOff } from 'exponential-backoff';
import {
  DescribeCertificateCommand,
  CertificateType,
} from '@aws-sdk/client-acm';
import { ListResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { AcmCertificateTestContext } from './test-context';
import { describe, it, before, after } from 'node:test';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-acm-certificate',
  program: () => import('./infrastructure'),
};

describe('ACM Certificate component deployment', () => {
  const region = process.env.AWS_REGION;
  const domainName = process.env.ICB_DOMAIN_NAME;
  const hostedZoneId = process.env.ICB_HOSTED_ZONE_ID;
  if (!region || !domainName || !hostedZoneId) {
    throw new Error(
      'AWS_REGION, ICB_DOMAIN_NAME and ICB_HOSTED_ZONE_ID environment variables are required',
    );
  }

  const ctx: AcmCertificateTestContext = {
    outputs: {},
    config: {
      exponentialBackOffConfig: {
        delayFirstAttempt: true,
        numOfAttempts: 5,
        startingDelay: 2000,
        timeMultiple: 1.5,
        jitter: 'full',
      },
    },
    clients: {
      acm: new ACMClient({ region }),
      route53: new Route53Client({ region }),
    },
  };

  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  it('should create certificate with correct domain name', async () => {
    const certificate = ctx.outputs.certificate.value;
    assert.ok(certificate.certificate, 'Should have certificate property');
    assert.ok(certificate.certificate.arn, 'Certificate should have ARN');

    return backOff(async () => {
      const certResult = await ctx.clients.acm.send(
        new DescribeCertificateCommand({
          CertificateArn: certificate.certificate.arn,
        }),
      );

      const cert = certResult.Certificate;
      assert.ok(cert, 'Certificate should exist');
      assert.strictEqual(
        cert.DomainName,
        domainName,
        'Certificate domain should match',
      );
      assert.strictEqual(
        cert.Type,
        CertificateType.AMAZON_ISSUED,
        'Should be Amazon issued certificate',
      );
    }, ctx.config.exponentialBackOffConfig);
  });

  it('should have validation record with correct resource record value', async () => {
    const certificate = ctx.outputs.certificate.value;
    const hostedZone = ctx.outputs.hostedZone.value;

    const certResult = await ctx.clients.acm.send(
      new DescribeCertificateCommand({
        CertificateArn: certificate.certificate.arn,
      }),
    );

    const domainValidation =
      certResult.Certificate?.DomainValidationOptions?.[0];
    assert.ok(domainValidation, 'Should have domain validation options');
    assert.ok(
      domainValidation.ResourceRecord,
      'Validation resource record should exists',
    );

    const recordsResult = await ctx.clients.route53.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZone.zoneId,
      }),
    );

    const records = recordsResult.ResourceRecordSets || [];
    const validationRecord = records.find(
      record => record.Name === domainValidation.ResourceRecord?.Name,
    );

    assert.ok(validationRecord, 'Validation record should exist');
    assert.strictEqual(
      validationRecord.TTL,
      600,
      'Validation record should have 600 TTL',
    );
    assert.strictEqual(
      validationRecord.ResourceRecords?.[0]?.Value,
      domainValidation.ResourceRecord?.Value,
      'Validation record should have correct value',
    );
  });
});
