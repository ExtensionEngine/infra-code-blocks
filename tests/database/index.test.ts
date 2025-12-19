import { describe, before, after } from 'node:test';
import * as automation from '../automation';
import { cleanupSnapshots } from './utils/cleanup-snapshots';
import * as config from './infrastructure/config';
import { DatabaseTestContext } from './test-context';
import { EC2Client } from '@aws-sdk/client-ec2';
import { IAMClient } from '@aws-sdk/client-iam';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import { KMSClient } from '@aws-sdk/client-kms';
import { RDSClient } from '@aws-sdk/client-rds';
import { requireEnv } from '../util';
import { testCustomDb } from './custom-db.test';
import { testDefaultDb } from './default-db.test';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-database',
  program: () => import('./infrastructure'),
};

const region = requireEnv('AWS_REGION');
const ctx: DatabaseTestContext = {
  outputs: {},
  config,
  clients: {
    rds: new RDSClient({ region }),
    ec2: new EC2Client({ region }),
    kms: new KMSClient({ region }),
    iam: new IAMClient({ region }),
  },
};

describe('Database component deployment', () => {
  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  describe('Default database', () => testDefaultDb(ctx));
  describe('Custom database', () => testCustomDb(ctx));
  after(() => cleanupSnapshots(ctx));
});
