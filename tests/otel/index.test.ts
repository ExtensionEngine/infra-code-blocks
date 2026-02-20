import { before, describe, after } from 'node:test';
import { InlineProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { XRayClient } from '@aws-sdk/client-xray';
import * as automation from '../automation';
import { requireEnv, unwrapOutputs } from '../util';
import { testOtelConfigBuilder } from './config.test';
import { testOtelCollectorConfigBuilderValidation } from './validation.test';
import { testOtelIntegration } from './integration.test';
import {
  errorPath,
  exponentialBackOffConfig,
  appName,
  prometheusNamespace,
  usersPath,
} from './infrastructure/config';
import { OtelTestContext, ProgramOutput } from './test-context';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-otel',
  program: () => import('./infrastructure'),
};

const region = requireEnv('AWS_REGION');
const ctx: OtelTestContext = {
  config: {
    region,
    usersPath,
    errorPath,
    appName,
    prometheusNamespace,
    exponentialBackOffConfig,
  },
  clients: {
    cloudwatchLogs: new CloudWatchLogsClient({ region }),
    xray: new XRayClient({ region }),
  },
};

describe('OpenTelemetry component deployment', () => {
  before(async () => {
    const outputs: OutputMap = await automation.deploy(programArgs);
    ctx.outputs = unwrapOutputs<ProgramOutput>(outputs);
  });

  // after(() => automation.destroy(programArgs));

  describe('Config builder', testOtelConfigBuilder);
  describe('Config validation', testOtelCollectorConfigBuilderValidation);
  describe('Integration', () => testOtelIntegration(ctx));
});
