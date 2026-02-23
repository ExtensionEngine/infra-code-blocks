import { it } from 'node:test';
import * as assert from 'node:assert';
import { Unwrap } from '@pulumi/pulumi';
import { request } from 'undici';
import { FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { GetTraceSummariesCommand } from '@aws-sdk/client-xray';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { backOff } from '../util';
import { OtelTestContext, ProgramOutput } from './test-context';

export function testOtelIntegration(ctx: OtelTestContext) {
  it('should export logs to CloudWatch Logs', async () => {
    const startTimeMs = Date.now();
    await requestEndpointWithExpectedStatus(ctx, ctx.config.usersPath, 200);

    const logGroup = ctx.outputs!.cloudWatchLogGroup;
    const logStreamName = ctx.outputs!.cloudWatchLogStreamName;
    const logGroupName = logGroup.name as unknown as Unwrap<
      typeof logGroup.name
    >;

    await backOff(async () => {
      const response = await ctx.clients.cloudwatchLogs.send(
        new FilterLogEventsCommand({
          logGroupName: logGroupName,
          logStreamNames: [logStreamName],
          startTime: startTimeMs,
        }),
      );

      assert.ok(
        (response.events?.length ?? 0) > 0,
        'Expected telemetry logs in CloudWatch log group',
      );
    }, ctx.config.exponentialBackOffConfig);
  });

  it('should export traces to AWS X-Ray', async () => {
    await requestEndpointWithExpectedStatus(ctx, ctx.config.errorPath, 500);

    await backOff(async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 10 * 60_000);
      const response = await ctx.clients.xray.send(
        new GetTraceSummariesCommand({
          StartTime: startTime,
          EndTime: endTime,
          Sampling: false,
        }),
      );
      const summaries = response.TraceSummaries ?? [];
      assert.ok(
        summaries.length > 0,
        'Expected at least one X-Ray trace summary',
      );
      assert.ok(
        summaries.some(summary => summary.HasFault),
        'Expected at least one X-Ray trace with error',
      );
    }, ctx.config.exponentialBackOffConfig);
  });

  it('should export metrics to Prometheus (AMP)', async () => {
    await requestEndpointWithExpectedStatus(ctx, ctx.config.usersPath, 200);

    const workspace = ctx.outputs!.prometheusWorkspace;

    await backOff(async () => {
      const response = await queryPrometheusSeries(
        ctx,
        workspace,
        `${ctx.config.prometheusNamespace}_.*`,
      );
      assert.strictEqual(response.status, 'success');
      assert.ok(
        response.data.length > 0,
        `Expected at least one Prometheus series in namespace '${ctx.config.prometheusNamespace}'`,
      );
    }, ctx.config.exponentialBackOffConfig);
  });
}

async function requestEndpointWithExpectedStatus(
  ctx: OtelTestContext,
  path: string,
  expectedStatus: number,
): Promise<void> {
  await backOff(async () => {
    const webServer = ctx.outputs!.webServer;
    const dnsName = webServer.lb.lb.dnsName as unknown as Unwrap<
      typeof webServer.lb.lb.dnsName
    >;
    const endpoint = `http://${dnsName}${path}`;
    const response = await request(endpoint);
    assert.strictEqual(
      response.statusCode,
      expectedStatus,
      `Endpoint ${endpoint} should return ${expectedStatus}`,
    );
  }, ctx.config.exponentialBackOffConfig);
}

type PrometheusSeriesResponse = {
  status: 'success' | 'error';
  data: Array<Record<string, string>>;
};

async function queryPrometheusSeries(
  ctx: OtelTestContext,
  workspace: ProgramOutput['prometheusWorkspace'],
  namespaceRegex: string,
): Promise<PrometheusSeriesResponse> {
  const signer = new SignatureV4({
    service: 'aps',
    region: ctx.config.region,
    credentials: defaultProvider(),
    sha256: Sha256,
  });

  const prometheusEndpoint = workspace.prometheusEndpoint as unknown as Unwrap<
    typeof workspace.prometheusEndpoint
  >;
  const endpoint = `${prometheusEndpoint.replace(/\/$/, '')}/api/v1/series`;
  const seriesUrl = new URL(endpoint);
  seriesUrl.searchParams.append('match[]', `{__name__=~"${namespaceRegex}"}`);
  const end = new Date();
  const start = new Date(end.getTime() - 60_000);
  seriesUrl.searchParams.set('start', start.toISOString());
  seriesUrl.searchParams.set('end', end.toISOString());

  const signedRequest = await signer.sign(
    new HttpRequest({
      protocol: seriesUrl.protocol,
      hostname: seriesUrl.hostname,
      method: 'GET',
      path: seriesUrl.pathname,
      query: Object.fromEntries(seriesUrl.searchParams.entries()),
      headers: {
        host: seriesUrl.host,
      },
    }),
  );

  const { body } = await request(seriesUrl.toString(), {
    method: 'GET',
    headers: signedRequest.headers,
  });

  return (await body.json()) as PrometheusSeriesResponse;
}
