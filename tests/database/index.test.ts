import { cleanupFinalSnapshot, testDefaultDb } from './default-db.test';
import { describe, before, after } from 'node:test';
import * as automation from '../automation';
import * as config from './infrastructure/config';
import { DatabaseTestContext } from './test-context';
import { EC2Client } from '@aws-sdk/client-ec2';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import { KMSClient } from '@aws-sdk/client-kms';
import { RDSClient } from '@aws-sdk/client-rds';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-database',
  program: () => import('./infrastructure'),
};

describe('Database component deployment', () => {
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error('AWS_REGION environment variable is required');
  }

  const ctx: DatabaseTestContext = {
    outputs: {},
    config,
    clients: {
      rds: new RDSClient({ region }),
      ec2: new EC2Client({ region }),
      kms: new KMSClient({ region }),
    },
  };

  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  describe('Default database', () => testDefaultDb(ctx));
  after(() => cleanupFinalSnapshot(ctx));

});
