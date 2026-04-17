import { before, describe, after } from 'node:test';
import { InlineProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import { IAMClient } from '@aws-sdk/client-iam';
import * as automation from '../automation';
import { requireEnv, unwrapOutputs } from '../util';
import { testAmpGrafana } from './amp-grafana.test';
import { testConfigurableGrafana } from './configurable-grafana.test';
import { testLogsAndTracesGrafana } from './logs-and-traces-grafana.test';
import * as infraConfig from './infrastructure/config';
import { GrafanaTestContext, ProgramOutput } from './test-context';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-grafana',
  program: () => import('./infrastructure'),
};

const region = requireEnv('AWS_REGION');
// REQUIRED SCOPES: accesspolicies:read, accesspolicies:write, accesspolicies:delete, stacks:read, stack-service-accounts:write
requireEnv('GRAFANA_CLOUD_ACCESS_POLICY_TOKEN');

const ctx: GrafanaTestContext = {
  config: {
    region,
    usersPath: infraConfig.usersPath,
    appName: infraConfig.appName,
    ampNamespace: infraConfig.ampNamespace,
    grafanaUrl: requireEnv('GRAFANA_URL'),
    grafanaAwsAccountId: requireEnv('GRAFANA_AWS_ACCOUNT_ID'),
  },
  clients: {
    iam: new IAMClient({ region }),
  },
};

describe('Grafana component deployment', () => {
  before(async () => {
    const outputs: OutputMap = await automation.deploy(programArgs);
    ctx.outputs = unwrapOutputs<ProgramOutput>(outputs);
  });

  after(() => automation.destroy(programArgs));

  describe('AMP Grafana', () => testAmpGrafana(ctx));
  describe('Configurable Grafana', () => testConfigurableGrafana(ctx));
  describe('Logs & Traces Grafana', () => testLogsAndTracesGrafana(ctx));
});
