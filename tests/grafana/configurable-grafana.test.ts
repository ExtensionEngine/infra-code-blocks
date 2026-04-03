import { it } from 'node:test';
import * as assert from 'node:assert';
import * as studion from '@studion/infra-code-blocks';
import { Unwrap } from '@pulumi/pulumi';
import { backOff } from '../util';
import { GrafanaTestContext } from './test-context';
import { grafanaRequest } from './util';

export function testConfigurableGrafana(ctx: GrafanaTestContext) {
  it('should have created the configurable AMP data source', async () => {
    const ampDataSource = (
      ctx.outputs!.configurableGrafana
        .connections[0] as studion.grafana.AMPConnection
    ).dataSource;
    const ampDataSourceName = ampDataSource.name as unknown as Unwrap<
      typeof ampDataSource.name
    >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/datasources/name/${encodeURIComponent(ampDataSourceName)}`,
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
    const folder = ctx.outputs!.configurableGrafana.folder;
    const folderUid = folder.uid as unknown as Unwrap<typeof folder.uid>;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/folders/${folderUid}`,
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

  it('should have created the custom dashboard', async () => {
    const dashboard = ctx.outputs!.configurableGrafana.dashboards[0];
    const dashboardUid = dashboard.uid as unknown as Unwrap<
      typeof dashboard.uid
    >;

    await backOff(async () => {
      const { body, statusCode } = await grafanaRequest(
        ctx,
        'GET',
        `/api/dashboards/uid/${dashboardUid}`,
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
