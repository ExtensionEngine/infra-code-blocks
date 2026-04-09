import { it } from 'node:test';
import * as assert from 'node:assert';
import * as studion from '@studion/infra-code-blocks';
import {
  GetRoleCommand,
  GetRolePolicyCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import { Unwrap } from '@pulumi/pulumi';
import { backOff } from '../util';
import { GrafanaTestContext } from './test-context';
import { grafanaRequest, requestEndpointWithExpectedStatus } from './util';

export function testAmpGrafana(ctx: GrafanaTestContext) {
  it('should have created the IAM role with AMP inline policy', async () => {
    const iamRole = ctx.outputs!.ampGrafana.connections[0].role;
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

  it('should have created the AMP data source', async () => {
    const grafana = ctx.outputs!.ampGrafana;

    const ampDataSource = (
      grafana.connections[0] as studion.grafana.AMPConnection
    ).dataSource;
    const ampDataSourceName = ampDataSource.name as unknown as Unwrap<
      typeof ampDataSource.name
    >;

    const authToken = grafana.serviceAccountToken as unknown as Unwrap<
      typeof grafana.serviceAccountToken
    >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/datasources/name/${encodeURIComponent(ampDataSourceName)}`,
        authToken,
      );
      assert.strictEqual(statusCode, 200, 'Expected data source to exist');

      const data = (await body.json()) as Record<string, unknown>;
      assert.strictEqual(
        data.type,
        'grafana-amazonprometheus-datasource',
        'Expected Amazon Prometheus data source type',
      );

      const workspace = ctx.outputs!.ampWorkspace;
      const ampEndpoint = workspace.prometheusEndpoint as unknown as Unwrap<
        typeof workspace.prometheusEndpoint
      >;
      assert.ok(
        (data.url as string).includes(ampEndpoint.replace(/\/$/, '')),
        'Expected data source URL to contain the AMP workspace endpoint',
      );
    });
  });

  it('should have created the dashboard with expected panels', async () => {
    const grafana = ctx.outputs!.ampGrafana;

    const dashboard = grafana.dashboards[0];
    const dashboardUid = dashboard.uid as unknown as Unwrap<
      typeof dashboard.uid
    >;

    const authToken = grafana.serviceAccountToken as unknown as Unwrap<
      typeof grafana.serviceAccountToken
    >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/dashboards/uid/${dashboardUid}`,
        authToken,
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
    });
  });

  it('should display metrics data in the dashboard', async () => {
    await requestEndpointWithExpectedStatus(ctx, ctx.config.usersPath, 200);

    const grafana = ctx.outputs!.ampGrafana;

    const ampDataSource = (
      grafana.connections[0] as studion.grafana.AMPConnection
    ).dataSource;
    const ampDataSourceName = ampDataSource.name as unknown as Unwrap<
      typeof ampDataSource.name
    >;

    const authToken = grafana.serviceAccountToken as unknown as Unwrap<
      typeof grafana.serviceAccountToken
    >;

    const { body: dsBody } = await grafanaRequest(
      ctx,
      'GET',
      `/api/datasources/name/${encodeURIComponent(ampDataSourceName)}`,
      authToken,
    );
    const dsData = (await dsBody.json()) as Record<string, unknown>;
    const dataSourceUid = dsData.uid as string;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'POST',
        '/api/ds/query',
        authToken,
        {
          queries: [
            {
              datasource: {
                type: 'grafana-amazonprometheus-datasource',
                uid: dataSourceUid,
              },
              expr: `{__name__=~"${ctx.config.ampNamespace}_.*"}`,
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
        `Expected Grafana to return metric frames for namespace '${ctx.config.ampNamespace}'`,
      );
    });
  });
}
