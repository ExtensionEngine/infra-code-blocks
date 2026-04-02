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
import { grafanaRequest } from './util';

const backOffConfig = { numOfAttempts: 15 };

export function testConfigurableGrafana(ctx: GrafanaTestContext) {
  it('should have created the folder with the configured name', async () => {
    const folder = ctx.outputs!.configurableGrafanaComponent.folder;
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
    }, backOffConfig);
  });

  it('should have created the custom dashboard', async () => {
    const dashboard = ctx.outputs!.configurableGrafanaComponent.dashboards[0];
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
      assert.ok(
        data.dashboard.panels.length > 0,
        'Expected at least one panel',
      );
    }, backOffConfig);
  });
}
