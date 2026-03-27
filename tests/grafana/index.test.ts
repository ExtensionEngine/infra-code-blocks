import { before, describe, after } from 'node:test';
import { InlineProgramArgs, OutputMap } from '@pulumi/pulumi/automation';
import { IAMClient } from '@aws-sdk/client-iam';
import * as automation from '../automation';
import { requireEnv, unwrapOutputs } from '../util';
import { testGrafanaSloDashboard } from './grafana-slo-dashboard.test';
import * as infraConfig from './infrastructure/config';
import { GrafanaTestContext, ProgramOutput } from './test-context';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-grafana',
  program: () => import('./infrastructure'),
};

const region = requireEnv('AWS_REGION');
const ctx: GrafanaTestContext = {
  config: {
    region,
    usersPath: infraConfig.usersPath,
    appName: infraConfig.appName,
    prometheusNamespace: infraConfig.prometheusNamespace,
    grafanaUrl: requireEnv('GRAFANA_URL'),
    grafanaAuth: requireEnv('GRAFANA_AUTH'),
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

  describe('SLO dashboard', () => testGrafanaSloDashboard(ctx));
});
