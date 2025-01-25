import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { LocalProgramArgs } from '@pulumi/pulumi/automation';
import fetch from 'node-fetch';
import status from 'http-status';
import path from 'upath';
import retry from 'async-retry';
import * as automation from '../automation';

const programArgs: LocalProgramArgs = {
  stackName: 'dev',
  workDir: path.join(__dirname, 'infrastructure')
};
const healthcheckPath = '/healthcheck';

describe('Web server component deployment', () => {
  let outputs: any;

  before(async () => {
    outputs = await automation.deploy(programArgs);
  });

  after(async () => {
    await automation.destroy(programArgs)
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
          const response = await fetch(`${webServerUrl}${healthcheckPath}`);
          if (response.status === status.NOT_FOUND) {
            return bail(new Error(`Healthcheck endpoint not found: ${response.status}`));
          }
          assert.strictEqual(
            response?.status,
            status.OK,
            `Expected status code 200 but got ${response?.status}`
          );
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
