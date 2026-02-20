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
    const usersResponse = await requestUsersEndpoint(ctx);
    assert.strictEqual(
      usersResponse.statusCode,
      200,
      '/users endpoint should return 200',
    );

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
    const startTimeMs = Date.now();
    const errorResponse = await requestErrorEndpoint(ctx);
    assert.ok(
      errorResponse.statusCode >= 500,
      '/error endpoint should return 5xx status',
    );
    const startTime = new Date(Math.max(0, startTimeMs - 30_000));
    const endTime = new Date();

    await backOff(async () => {
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
        'Expected at least one X-Ray trace with error after calling /error endpoint',
      );
    }, ctx.config.exponentialBackOffConfig);
  });

  it('should export metrics to Prometheus (AMP)', async () => {
    const usersResponse = await requestUsersEndpoint(ctx);
    assert.strictEqual(
      usersResponse.statusCode,
      200,
      '/users endpoint should return 200',
    );

    const workspace = ctx.outputs!.prometheusWorkspace;
    const seriesEndpoint = getPrometheusSeriesEndpoint(workspace);

    await backOff(async () => {
      const response = await queryPrometheusSeries(
        ctx,
        seriesEndpoint,
        `${ctx.config.prometheusNamespace}_.*`,
      );
      assert.strictEqual(
        response.statusCode,
        200,
        'Expected HTTP 200 from AMP series API',
      );
      assert.strictEqual(response.status, 'success');
      assert.ok(
        response.data.length > 0,
        `Expected at least one Prometheus series in namespace '${ctx.config.prometheusNamespace}'`,
      );
    }, ctx.config.exponentialBackOffConfig);
  });
}

type PrometheusSeriesResponse = {
  statusCode: number;
  status: 'success' | 'error';
  data: Array<Record<string, string>>;
};

function getPrometheusSeriesEndpoint(
  workspace: ProgramOutput['prometheusWorkspace'],
): string {
  const prometheusEndpoint = workspace.prometheusEndpoint as unknown as Unwrap<
    typeof workspace.prometheusEndpoint
  >;
  return `${prometheusEndpoint.replace(/\/$/, '')}/api/v1/series`;
}

async function queryPrometheusSeries(
  ctx: OtelTestContext,
  endpoint: string,
  namespaceRegex: string,
): Promise<PrometheusSeriesResponse> {
  const signer = new SignatureV4({
    service: 'aps',
    region: ctx.config.region,
    credentials: defaultProvider(),
    sha256: Sha256,
  });

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

  const { body, statusCode } = await request(seriesUrl.toString(), {
    method: 'GET',
    headers: signedRequest.headers,
  });

  const parsed = (await body.json()) as Omit<
    PrometheusSeriesResponse,
    'statusCode'
  >;
  return { statusCode, ...parsed };
}

async function requestUsersEndpoint(ctx: OtelTestContext): Promise<{
  statusCode: number;
}> {
  const baseUrl = getBaseUrl(ctx);
  return request(`${baseUrl}${ctx.config.usersPath}`);
}

async function requestErrorEndpoint(ctx: OtelTestContext): Promise<{
  statusCode: number;
}> {
  const baseUrl = getBaseUrl(ctx);
  return request(`${baseUrl}${ctx.config.errorPath}`);
}

function getBaseUrl(ctx: OtelTestContext): string {
  const webServer = ctx.outputs!.webServer;
  const dnsName = webServer.lb.lb.dnsName as unknown as Unwrap<
    typeof webServer.lb.lb.dnsName
  >;
  return `http://${dnsName}`;
}
