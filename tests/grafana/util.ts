import * as assert from 'node:assert';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { Unwrap } from '@pulumi/pulumi';
import { backOff } from '../util';
import { GrafanaTestContext } from './test-context';

export async function grafanaRequest(
  ctx: GrafanaTestContext,
  method: Dispatcher.HttpMethod,
  path: string,
  token: string,
  body?: unknown,
) {
  const url = `${ctx.config.grafanaUrl.replace(/\/$/, '')}${path}`;
  return request(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function requestEndpointWithExpectedStatus(
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
  });
}
