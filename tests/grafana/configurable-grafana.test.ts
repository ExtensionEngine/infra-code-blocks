import { it } from 'node:test';
import * as assert from 'node:assert';
import * as studion from '@studion/infra-code-blocks';
import { Unwrap } from '@pulumi/pulumi';
import { backOff } from '../util';
import { GrafanaTestContext } from './test-context';
import { grafanaRequest } from './util';

export function testConfigurableGrafana(ctx: GrafanaTestContext) {
  it('should have created the configurable AMP data source', async () => {
    const grafana = ctx.outputs!.configurableGrafana;

    const ampDataSource = (
      grafana.connections[0] as studion.grafana.AMPConnection
    ).dataSource;
    const ampDataSourceName = ampDataSource.name as unknown as Unwrap<
      typeof ampDataSource.name
    >;

    const authToken = grafana.serviceAccountToken.key as unknown as Unwrap<
      typeof grafana.serviceAccountToken.key
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

  it('should have created the folder with the configured name', async () => {
    const grafana = ctx.outputs!.configurableGrafana;

    const folder = grafana.folder;
    const folderUid = folder.uid as unknown as Unwrap<typeof folder.uid>;

    const authToken = grafana.serviceAccountToken.key as unknown as Unwrap<
      typeof grafana.serviceAccountToken.key
    >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/folders/${folderUid}`,
        authToken,
      );
      assert.strictEqual(statusCode, 200, 'Expected folder to exist');

      const data = (await body.json()) as { title: string };
      assert.strictEqual(
        data.title,
        'ICB Configurable Test Folder',
        'Expected folder title to match withFolderName() value',
      );
    });
  });

  it('should have applied the configured service account token rotation', async () => {
    const token = ctx.outputs!.configurableGrafana.serviceAccountToken;

    const hasExpired = token.hasExpired as unknown as Unwrap<
      typeof token.hasExpired
    >;
    const secondsToLive = token.secondsToLive as unknown as Unwrap<
      typeof token.secondsToLive
    >;
    const earlyRotationWindowSeconds =
      token.earlyRotationWindowSeconds as unknown as Unwrap<
        typeof token.earlyRotationWindowSeconds
      >;

    assert.strictEqual(hasExpired, false, 'Expected token to not be expired');
    assert.strictEqual(
      secondsToLive,
      3_888_000,
      'Expected configured secondsToLive (45 days) to be applied',
    );
    assert.strictEqual(
      earlyRotationWindowSeconds,
      259_200,
      'Expected configured earlyRotationWindowSeconds (3 days) to be applied',
    );
  });

  it('should have applied the configured access policy token rotation', async () => {
    const token = ctx.outputs!.configurableGrafana.accessPolicyToken;

    const expireAfter = token.expireAfter as unknown as Unwrap<
      typeof token.expireAfter
    >;
    const earlyRotationWindow = token.earlyRotationWindow as unknown as Unwrap<
      typeof token.earlyRotationWindow
    >;

    assert.strictEqual(
      expireAfter,
      '1080h',
      'Expected configured expireAfter (45 days) to be applied',
    );
    assert.strictEqual(
      earlyRotationWindow,
      '72h',
      'Expected configured earlyRotationWindow (3 days) to be applied',
    );
  });

  it('should have created the custom dashboard', async () => {
    const grafana = ctx.outputs!.configurableGrafana;

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
      assert.strictEqual(statusCode, 200, 'Expected custom dashboard to exist');

      const data = (await body.json()) as {
        dashboard: { title: string; panels: Array<{ title: string }> };
      };
      assert.strictEqual(
        data.dashboard.title,
        'ICB Grafana Configurable Dashboard',
        'Expected custom dashboard title',
      );
      assert.strictEqual(
        data.dashboard.panels[0].title,
        'AMP Requests',
        'Expected panel title',
      );
    });
  });
}
