import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { LocalProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import fetch from 'node-fetch';
import * as path from 'upath';
import * as retry from 'async-retry';
import * as automation from '../automation';

const args: LocalProgramArgs = {
  stackName: 'dev',
  workDir: path.join(__dirname, 'infrastructure')
};

describe('Web server component deployment', () => {
  let outputs: OutputMap;

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
});
