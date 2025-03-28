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

describe('Static site component deployment', () => {
  let outputs: OutputMap;

  before(async () => {
    outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  it('is blank', () => {
    console.log(outputs);
  });
});
