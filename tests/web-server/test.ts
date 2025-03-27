import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { LocalProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import { request } from 'undici';
import * as path from 'upath';
import { backOff } from 'exponential-backoff';
import * as automation from '../automation';

const args: LocalProgramArgs = {
  stackName: 'dev',
  workDir: path.join(__dirname, 'infrastructure')
};

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

describe('Web server component deployment', () => {
  let outputs: OutputMap;

  before(async () => {
    outputs = await automation.deploy(args);
  });

  after(() => automation.destroy(args));

  it('Web API\'s /healthcheck should return 200', () => {
    const { services } = outputs.project.value;
    const webServerLbDns = services['web-server-example'].lb.dnsName;

    if (!webServerLbDns || typeof webServerLbDns !== 'string') {
      throw new Error(`Invalid load balancer DNS name: ${webServerLbDns}`);
    }

    const webServerUrl = `http://${webServerLbDns}`;

    return backOff(async () => {
      const response = await request(`${webServerUrl}/healthcheck`);
      if (response.statusCode === 404) {
        throw new NonRetryableError('Healthcheck endpoint not found');
      }

      const body = await response.body.text();
      assert.strictEqual(
        response.statusCode,
        200,
        `Expected status code 200 but got ${response.statusCode}`
      );
      assert.strictEqual(
        body,
        'OK',
        `Expected "OK" but got "${body}"`
      );
    }, {
      retry: error => !(error instanceof NonRetryableError),
      delayFirstAttempt: true,
      numOfAttempts: 5,
      startingDelay: 1000,
      timeMultiple: 2,
      jitter: 'full'
    });
  });
});
