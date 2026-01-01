import { it } from 'node:test';
import * as assert from 'node:assert';
import { WebServerTestContext } from './test-context';
import { DescribeListenersCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ListResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { backOff } from 'exponential-backoff';
import { request } from 'undici';
import status from 'http-status';

export function testWebServerWithDomain(ctx: WebServerTestContext) {
  it('should configure HTTPS listener with certificate for web server with custom domain', async () => {
    const webServer = ctx.outputs.webServerWithDomain.value;
    await assertHttpsListenerWithCertificate(ctx, webServer);
  });

  it('should create single DNS A record for web server with custom domain', async () => {
    const webServer = ctx.outputs.webServerWithDomain.value;
    const { primary } = ctx.config.webServerWithDomainConfig;

    assert.ok(webServer.dnsRecord, 'DNS record should be configured');
    await assertDnsARecord(ctx, primary, webServer.lb.lb.dnsName);
  });

  it('should make web server accessible via custom domain over HTTPS', async () => {
    const { primary } = ctx.config.webServerWithDomainConfig;
    await assertHealthCheckAccessible(ctx, primary);
  });

  it('should configure HTTPS listener with certificate for web server with SAN certificate', async () => {
    const webServer = ctx.outputs.webServerWithSanCertificate.value;
    await assertHttpsListenerWithCertificate(ctx, webServer);
  });

  it('should create DNS records for primary domain and all SANs', async () => {
    const webServer = ctx.outputs.webServerWithSanCertificate.value;
    const { primary, sans } = ctx.config.webServerWithSanCertificateConfig;

    assert.ok(webServer.dnsRecord, 'Primary DNS record should exist');
    assert.ok(webServer.sanRecords, 'SAN records should exist');

    await assertDnsARecord(ctx, primary, webServer.lb.lb.dnsName);

    for (const san of sans) {
      await assertDnsARecord(ctx, san, webServer.lb.lb.dnsName);
    }
  });

  it('should be accessible via all SAN domains over HTTPS', async () => {
    const { primary, sans } = ctx.config.webServerWithSanCertificateConfig;
    const allDomains = [primary, ...sans];

    for (const domain of allDomains) {
      await assertHealthCheckAccessible(ctx, domain);
    }
  });

  it('should configure HTTPS listener with certificate for web server', async () => {
    const webServer = ctx.outputs.webServerWithCertificate.value;
    await assertHttpsListenerWithCertificate(ctx, webServer);
  });

  it('should create DNS record only for specified domain in web server with certificate', async () => {
    const webServer = ctx.outputs.webServerWithCertificate.value;
    const { primary } = ctx.config.webServerWithCertificateConfig;

    assert.ok(webServer.dnsRecord, 'DNS record should exist');
    await assertDnsARecord(ctx, primary, webServer.lb.lb.dnsName);
  });

  it('should be accessible via specified domain over HTTPS', async () => {
    const { primary } = ctx.config.webServerWithCertificateConfig;
    await assertHealthCheckAccessible(ctx, primary);
  });
}

async function assertHttpsListenerWithCertificate(
  ctx: WebServerTestContext,
  webServer: any,
) {
  assert.ok(webServer.certificate, 'Certificate should be configured');
  assert.ok(webServer.lb.tlsListener, 'TLS listener should exist');

  const command = new DescribeListenersCommand({
    ListenerArns: [webServer.lb.tlsListener.arn],
  });

  const response = await ctx.clients.elb.send(command);
  const [listener] = response.Listeners ?? [];

  assert.ok(listener, 'HTTPS listener should exist in AWS');
  assert.strictEqual(
    listener.Port,
    443,
    'HTTPS listener should be on port 443',
  );
  assert.strictEqual(
    listener.Protocol,
    'HTTPS',
    'Listener protocol should be HTTPS',
  );

  const certificateArn = listener.Certificates?.[0]?.CertificateArn;
  assert.strictEqual(
    certificateArn,
    webServer.certificate.certificate.arn,
    'Certificate ARN should match the configured certificate',
  );
}

async function assertDnsARecord(
  ctx: WebServerTestContext,
  domain: string,
  loadBalancerDnsName: string,
) {
  const hostedZoneId = process.env.ICB_HOSTED_ZONE_ID!;

  const command = new ListResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    StartRecordName: domain,
    StartRecordType: 'A',
    MaxItems: 1,
  });

  const response = await ctx.clients.route53.send(command);
  const record = response.ResourceRecordSets?.find(
    r => r.Name === `${domain}.` && r.Type === 'A',
  );

  assert.ok(record, `A record for ${domain} should exist in Route53`);
  assert.ok(record.AliasTarget, 'Record should be an alias record');
  assert.ok(
    record.AliasTarget?.DNSName?.includes(loadBalancerDnsName),
    `Record for ${domain} should point to load balancer`,
  );
}

async function assertHealthCheckAccessible(
  ctx: WebServerTestContext,
  domain: string,
) {
  return backOff(
    async () => {
      const response = await request(
        `https://${domain}${ctx.config.healthCheckPath}`,
      );
      assert.strictEqual(
        response.statusCode,
        status.OK,
        `Should receive 200 from ${domain}`,
      );
    },
    {
      delayFirstAttempt: true,
      numOfAttempts: 10,
      startingDelay: 2000,
      timeMultiple: 2,
      jitter: 'full',
    },
  );
}
