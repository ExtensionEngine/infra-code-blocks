import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { LocalProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import fetch from 'node-fetch';
import status from 'http-status';
import * as path from 'upath';
import * as retry from 'async-retry';
import * as automation from '../automation';

const programArgs: LocalProgramArgs = {
  stackName: 'dev',
  workDir: path.join(__dirname, 'infrastructure')
};
const healthcheckPath = '/healthcheck';

describe('Web server component deployment', () => {
  let outputs: OutputMap;

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
});
