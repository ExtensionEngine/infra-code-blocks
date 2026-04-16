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

export function testLogsAndTracesGrafana(ctx: GrafanaTestContext) {
  it('should have created the IAM role with CloudWwatch logs inline policy', async () => {
    const iamRole = ctx.outputs!.logsAndTracesGrafana.connections[0].role;
    const grafanaCloudWatchLogsRoleArn = iamRole.arn as unknown as Unwrap<
      typeof iamRole.arn
    >;
    const roleName = grafanaCloudWatchLogsRoleArn.split('/').pop()!;
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
      'logs:DescribeLogGroups',
      'logs:GetLogGroupFields',
      'logs:StartQuery',
      'logs:StopQuery',
      'logs:GetQueryResults',
      'logs:GetLogEvents',
    ].sort();
    assert.deepStrictEqual(
      actions,
      expectedActions,
      'CloudWatch logs policy actions do not match expected actions',
    );
  });

  it('should have created the IAM role with xRay inline policy', async () => {
    const iamRole = ctx.outputs!.logsAndTracesGrafana.connections[1].role;
    const grafanaXRayRoleArn = iamRole.arn as unknown as Unwrap<
      typeof iamRole.arn
    >;
    const roleName = grafanaXRayRoleArn.split('/').pop()!;
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
      'xray:BatchGetTraces',
      'xray:GetTraceSummaries',
      'xray:GetTraceGraph',
      'xray:GetGroups',
      'xray:GetTimeSeriesServiceStatistics',
      'xray:GetInsightSummaries',
      'xray:GetInsight',
      'xray:GetServiceGraph',
      'ec2:DescribeRegions',
    ].sort();
    assert.deepStrictEqual(
      actions,
      expectedActions,
      'XRay policy actions do not match expected actions',
    );
  });

  it('should have created the CloudWatch data source', async () => {
    const grafana = ctx.outputs!.logsAndTracesGrafana;
    const cloudWatchDataSource = (
      grafana.connections[0] as studion.grafana.CloudWatchLogsConnection
    ).dataSource;
    const cloudWatchDataSourceName =
      cloudWatchDataSource.name as unknown as Unwrap<
        typeof cloudWatchDataSource.name
      >;

    const authToken = grafana.serviceAccountToken.key as unknown as Unwrap<
      typeof grafana.serviceAccountToken.key
    >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/datasources/name/${encodeURIComponent(cloudWatchDataSourceName)}`,
        authToken,
      );
      assert.strictEqual(statusCode, 200, 'Expected data source to exist');

      const data = (await body.json()) as Record<string, unknown>;
      assert.strictEqual(
        data.type,
        'cloudwatch',
        'Expected CloudWatch data source type',
      );
    });
  });

  it('should have created the XRay data source', async () => {
    const grafana = ctx.outputs!.logsAndTracesGrafana;
    const xRayDataSource = (
      grafana.connections[1] as studion.grafana.XRayConnection
    ).dataSource;
    const xRayDataSourceName = xRayDataSource.name as unknown as Unwrap<
      typeof xRayDataSource.name
    >;

    const authToken = grafana.serviceAccountToken.key as unknown as Unwrap<
      typeof grafana.serviceAccountToken.key
    >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/datasources/name/${encodeURIComponent(xRayDataSourceName)}`,
        authToken,
      );
      assert.strictEqual(statusCode, 200, 'Expected data source to exist');

      const data = (await body.json()) as Record<string, unknown>;
      assert.strictEqual(
        data.type,
        'grafana-x-ray-datasource',
        'Expected XRay data source type',
      );
    });
  });

  it('should have created the dashboard with expected panels', async () => {
    const grafana = ctx.outputs!.logsAndTracesGrafana;
    const dashboard = grafana.dashboards[0];
    const dashboardUid = dashboard.uid as unknown as Unwrap<
      typeof dashboard.uid
    >;

    const authToken = grafana.serviceAccountToken.key as unknown as Unwrap<
      typeof grafana.serviceAccountToken.key
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
        'ICB Grafana Test Logs & Traces',
        'Expected dashboard title to match',
      );

      const panelTitles = data.dashboard.panels.map(p => p.title).sort();
      const expectedPanels = ['Logs', 'Traces'];
      assert.deepStrictEqual(
        panelTitles,
        expectedPanels.sort(),
        'Dashboard panels do not match expected panels',
      );
    });
  });

  it('should display logs data in the dashboard', async () => {
    await requestEndpointWithExpectedStatus(ctx, ctx.config.usersPath, 200);

    const grafana = ctx.outputs!.logsAndTracesGrafana;

    const cloudWatchLogsDataSource = (
      grafana.connections[0] as studion.grafana.CloudWatchLogsConnection
    ).dataSource;
    const cloudWatchLogsDataSourceName =
      cloudWatchLogsDataSource.name as unknown as Unwrap<
        typeof cloudWatchLogsDataSource.name
      >;

    const authToken = grafana.serviceAccountToken.key as unknown as Unwrap<
      typeof grafana.serviceAccountToken.key
    >;

    const { body: dsBody } = await grafanaRequest(
      ctx,
      'GET',
      `/api/datasources/name/${encodeURIComponent(cloudWatchLogsDataSourceName)}`,
      authToken,
    );
    const dsData = (await dsBody.json()) as Record<string, unknown>;
    const dataSourceUid = dsData.uid as string;
    const cloudWatchLogGroupName = ctx.outputs!.cloudWatchLogGroup.name;

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
                type: 'cloudwatch',
                uid: dataSourceUid,
              },
              queryMode: 'Logs',
              logGroups: [{ name: cloudWatchLogGroupName }],
              expression:
                'fields @timestamp, @message | sort @timestamp desc | limit 10',
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
        `Expected Grafana to return log frames for log group '${cloudWatchLogGroupName}'`,
      );
    });
  });

  it('should display traces data in the dashboard', async () => {
    await requestEndpointWithExpectedStatus(ctx, ctx.config.usersPath, 200);

    const grafana = ctx.outputs!.logsAndTracesGrafana;

    const xRayDataSource = (
      grafana.connections[1] as studion.grafana.XRayConnection
    ).dataSource;
    const xRayDataSourceName = xRayDataSource.name as unknown as Unwrap<
      typeof xRayDataSource.name
    >;

    const authToken = grafana.serviceAccountToken.key as unknown as Unwrap<
      typeof grafana.serviceAccountToken.key
    >;

    const { body: dsBody } = await grafanaRequest(
      ctx,
      'GET',
      `/api/datasources/name/${encodeURIComponent(xRayDataSourceName)}`,
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
                type: 'grafana-x-ray-datasource',
                uid: dataSourceUid,
              },
              queryType: 'getTraceSummaries',
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
        `Expected Grafana to return trace frames from X-Ray`,
      );
    });
  });
}
