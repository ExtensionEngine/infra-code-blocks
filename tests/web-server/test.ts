import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { LocalProgramArgs } from '@pulumi/pulumi/automation';
import fetch from 'node-fetch';
import * as path from 'upath';
import * as retry from 'async-retry';
import * as automation from '../automation';

const args: LocalProgramArgs = {
  stackName: 'dev',
  workDir: path.join(__dirname, 'infrastructure')
};

describe('Web server component deployment', () => {
  let outputs: any;

  before(async () => {
    outputs = await automation.deploy(args);
  });

  after(async () => {
    await automation.destroy(args)
  });

  it('Web API\'s /healthcheck should return 200', async () => {
    const { services } = outputs.project.value;
    const webServerLbDns = services['web-server-example'].lb.dnsName;

    if (!webServerLbDns || typeof webServerLbDns !== 'string') {
      throw new Error(`Invalid load balancer DNS name: ${webServerLbDns}`);
    }

    const webServerUrl = `http://${webServerLbDns}`;

    await retry(
      async (bail) => {
        const response = await fetch(`${webServerUrl}/healthcheck`);
        if (response.status === 404) {
          return bail(new Error(`Healthcheck endpoint not found: ${response.status}`));
        }
        const text = await response.text();

        assert.strictEqual(
          response.status,
          200,
          `Expected status code 200 but got ${response.status}`
        );
        assert.strictEqual(text, 'OK', `Expected "OK" but got "${text}"`);
      }
    );
  });

  it('should have cross zone load balancing enabled', async () => {
    const { lb } = outputs.project.value.services['web-server-example'];
    assert.strictEqual(lb.enableCrossZoneLoadBalancing, true);
  });

  it('should have VPC with subnets in different availability zones', async () => {
    const { subnets } = outputs.project.value.vpc;
    assert.ok(subnets.length >= 2, 'Should have at least 2 subnets');
    const azs = new Set(subnets.map((subnet: any) => subnet.availabilityZone));
    assert.ok(azs.size >= 2, 'Subnets should be in different availability zones');
  });
});
