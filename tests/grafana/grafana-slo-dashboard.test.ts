import { it } from 'node:test';
import * as assert from 'node:assert';
import * as studion from '@studion/infra-code-blocks';
import {
  GetRoleCommand,
  GetRolePolicyCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { Unwrap } from '@pulumi/pulumi';
import { backOff } from '../util';
import { GrafanaTestContext } from './test-context';

const backOffConfig = { numOfAttempts: 15 };

export function testGrafanaSloDashboard(ctx: GrafanaTestContext) {
  it('should have created the Prometheus data source', async () => {
    const grafana = ctx.outputs!.grafanaSloComponent;
    const prometheusDataSource = (
      grafana.connections[0] as studion.grafana.AMPConnection
    ).dataSource;
    const prometheusDataSourceName =
      prometheusDataSource.name as unknown as Unwrap<
        typeof prometheusDataSource.name
      >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/datasources/name/${encodeURIComponent(prometheusDataSourceName)}`,
      );
      assert.strictEqual(statusCode, 200, 'Expected data source to exist');

      const data = (await body.json()) as Record<string, unknown>;
      assert.strictEqual(
        data.type,
        'grafana-amazonprometheus-datasource',
        'Expected Amazon Prometheus data source type',
      );

      const workspace = ctx.outputs!.prometheusWorkspace;
      const prometheusEndpoint =
        workspace.prometheusEndpoint as unknown as Unwrap<
          typeof workspace.prometheusEndpoint
        >;
      assert.ok(
        (data.url as string).includes(prometheusEndpoint.replace(/\/$/, '')),
        'Expected data source URL to contain the AMP workspace endpoint',
      );
    }, backOffConfig);
  });

  it('should have created the dashboard with expected panels', async () => {
    const dashboard = ctx.outputs!.grafanaSloComponent.dashboards[0];
    const dashboardUid = dashboard.uid as unknown as Unwrap<
      typeof dashboard.uid
    >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/dashboards/uid/${dashboardUid}`,
      );
      assert.strictEqual(statusCode, 200, 'Expected dashboard to exist');

      const data = (await body.json()) as {
        dashboard: { title: string; panels: Array<{ title: string }> };
      };
      assert.strictEqual(
        data.dashboard.title,
        'ICB Grafana Test SLO',
        'Expected dashboard title to match',
      );

      const panelTitles = data.dashboard.panels.map(p => p.title).sort();
      const expectedPanels = [
        'Availability',
        'Availability Burn Rate',
        'Success Rate',
        'Success Rate Burn Rate',
        'HTTP Request Success Rate',
        'Request % below 250ms',
        'Latency Burn Rate',
        '99th Percentile Latency',
        'Request percentage below 250ms',
      ];
      assert.deepStrictEqual(
        panelTitles,
        expectedPanels.sort(),
        'Dashboard panels do not match expected panels',
      );
    }, backOffConfig);
  });

  it('should display metrics data in the dashboard', async () => {
    await requestEndpointWithExpectedStatus(ctx, ctx.config.usersPath, 200);

    const prometheusDataSource = (
      ctx.outputs!.grafanaSloComponent
        .connections[0] as studion.grafana.AMPConnection
    ).dataSource;
    const prometheusDataSourceName =
      prometheusDataSource.name as unknown as Unwrap<
        typeof prometheusDataSource.name
      >;
    const { body: dsBody } = await grafanaRequest(
      ctx,
      'GET',
      `/api/datasources/name/${encodeURIComponent(prometheusDataSourceName)}`,
    );
    const dsData = (await dsBody.json()) as Record<string, unknown>;
    const dataSourceUid = dsData.uid as string;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'POST',
        '/api/ds/query',
        {
          queries: [
            {
              datasource: {
                type: 'grafana-amazonprometheus-datasource',
                uid: dataSourceUid,
              },
              expr: `{__name__=~"${ctx.config.prometheusNamespace}_.*"}`,
              instant: true,
              refId: 'A',
            },
          ],
          from: 'now-5m',
          to: 'now',
        },
      );
      assert.strictEqual(statusCode, 200, 'Expected query to succeed');

      const data = (await body.json()) as {
        results: Record<string, { frames: Array<unknown> }>;
      };
      const frames = data.results?.A?.frames ?? [];
      assert.ok(
        frames.length > 0,
        `Expected Grafana to return metric frames for namespace '${ctx.config.prometheusNamespace}'`,
      );
    }, backOffConfig);
  });

  it('should have created the IAM role with AMP inline policy', async () => {
    const iamRole = ctx.outputs!.grafanaSloComponent.connections[0].role;
    const grafanaAmpRoleArn = iamRole.arn as unknown as Unwrap<
      typeof iamRole.arn
    >;
    const roleName = grafanaAmpRoleArn.split('/').pop()!;
    const { Role } = await ctx.clients.iam.send(
      new GetRoleCommand({ RoleName: roleName }),
    );
    assert.ok(Role, 'Grafana IAM role should exist');

    const { PolicyNames } = await ctx.clients.iam.send(
      new ListRolePoliciesCommand({ RoleName: roleName }),
    );
    assert.ok(
      PolicyNames && PolicyNames.length > 0,
      'IAM role should have at least one inline policy',
    );

    const { PolicyDocument } = await ctx.clients.iam.send(
      new GetRolePolicyCommand({
        RoleName: roleName,
        PolicyName: PolicyNames[0],
      }),
    );
    const policy = JSON.parse(decodeURIComponent(PolicyDocument!)) as {
      Statement: Array<{ Action: string[] }>;
    };
    const actions = policy.Statement.flatMap(s => s.Action).sort();
    const expectedActions = [
      'aps:GetSeries',
      'aps:GetLabels',
      'aps:GetMetricMetadata',
      'aps:QueryMetrics',
    ].sort();
    assert.deepStrictEqual(
      actions,
      expectedActions,
      'AMP policy actions do not match expected actions',
    );
  });
}

async function requestEndpointWithExpectedStatus(
  ctx: GrafanaTestContext,
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
  }, backOffConfig);
}

async function grafanaRequest(
  ctx: GrafanaTestContext,
  method: Dispatcher.HttpMethod,
  path: string,
  body?: unknown,
) {
  const url = `${ctx.config.grafanaUrl.replace(/\/$/, '')}${path}`;
  return request(url, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.config.grafanaAuth}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
