import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { LocalProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import { request } from 'undici';
import { backOff } from 'exponential-backoff';
import status from 'http-status';
import * as path from 'pathe';
import * as automation from '../automation';

const programArgs: LocalProgramArgs = {
  stackName: 'dev',
  workDir: path.join(__dirname, 'infrastructure')
};
const healthcheckPath = '/healthcheck';

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

describe('Web server component deployment', () => {
  let outputs: OutputMap;

  before(async () => {
    outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  it('Web API\'s /healthcheck should return 200', () => {
    const { services } = outputs.project.value;
    const webServerLbDns = services['web-server-example'].lb.dnsName;

    if (!webServerLbDns || typeof webServerLbDns !== 'string') {
      throw new Error(`Invalid load balancer DNS name: ${webServerLbDns}`);
    }

    const webServerUrl = `http://${webServerLbDns}`;

    return backOff(async () => {
      const response = await request(`${webServerUrl}${healthcheckPath}`);
      if (response.statusCode === status.NOT_FOUND) {
        throw new NonRetryableError('Healthcheck endpoint not found');
      }

      const body = await response.body.text();
      assert.strictEqual(
        response.statusCode,
        status.OK,
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
