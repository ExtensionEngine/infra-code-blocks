import { describe, before, after } from 'node:test';
import {
  DescribeDBInstancesCommand,
  DescribeDBSubnetGroupsCommand,
} from '@aws-sdk/client-rds';
import {
  DescribeKeyCommand,
  GetKeyRotationStatusCommand,
} from '@aws-sdk/client-kms';
import {
  DescribeSecurityGroupsCommand,
  IpPermission,
} from '@aws-sdk/client-ec2';
import * as assert from 'node:assert';
import * as automation from '../automation';
import { cleanupSnapshots } from './util';
import * as config from './infrastructure/config';
import { DatabaseTestContext } from './test-context';
import { EC2Client } from '@aws-sdk/client-ec2';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import { it } from 'node:test';
import { KMSClient } from '@aws-sdk/client-kms';
import { RDSClient } from '@aws-sdk/client-rds';
import { requireEnv } from '../util';

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
  },
};

describe('Database component deployment', () => {
  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(async () => {
    await automation.destroy(programArgs);
    await cleanupSnapshots(ctx);
  });

  it('should create a database', async () => {
    const database = ctx.outputs.defaultDb.value;

    assert.ok(database, 'Database should be defined');
    assert.strictEqual(
      database.name,
      `${ctx.config.appName}-default-db`,
      'Database should have correct name',
    );
    assert.ok(database.instance, 'Database instance should be defined');

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: database.instance.dbInstanceIdentifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances && DBInstances.length === 1,
      'Database instance should be created',
    );
    const [DBInstance] = DBInstances;
    assert.strictEqual(
      DBInstance.DBInstanceIdentifier,
      database.instance.dbInstanceIdentifier,
      'Database instance identifier should match',
    );
  });

  it('should create other resources', () => {
    const database = ctx.outputs.defaultDb.value;

    assert.ok(database.dbSecurityGroup, 'Db security group should be defined');
    assert.ok(database.dbSubnetGroup, 'Db subnet group should be defined');
    assert.ok(database.kmsKeyId, 'Kms key id should be defined');
    assert.ok(database.password, 'Password should be defined');
  });

  it('should configure database instance with correct defaults', () => {
    const instance = ctx.outputs.defaultDb.value.instance;

    assert.partialDeepStrictEqual(
      instance,
      {
        dbName: ctx.config.dbName,
        masterUsername: ctx.config.dbUsername,
        multiAz: false,
        applyImmediately: false,
        allocatedStorage: '20',
        maxAllocatedStorage: 100,
        dbInstanceClass: 'db.t4g.micro',
        enablePerformanceInsights: false,
        allowMajorVersionUpgrade: false,
        autoMinorVersionUpgrade: true,
        engineVersion: '17.2',
        engine: 'postgres',
        storageEncrypted: true,
        publiclyAccessible: false,
      },
      'Database instance should be configured correctly',
    );
  });

  it('should create subnet group in the correct VPC', async () => {
    const database = ctx.outputs.defaultDb.value;
    const vpc = ctx.outputs.vpc.value;
    const dbSubnetGroupName = database.dbSubnetGroup.name;

    const command = new DescribeDBSubnetGroupsCommand({
      DBSubnetGroupName: dbSubnetGroupName,
    });

    const { DBSubnetGroups } = await ctx.clients.rds.send(command);
    assert.ok(
      DBSubnetGroups && DBSubnetGroups.length > 0,
      'DB subnet groups should exist',
    );
    const [subnetGroup] = DBSubnetGroups;
    assert.strictEqual(
      subnetGroup.VpcId,
      vpc.vpc.vpcId,
      'DB subnet group should be in the correct VPC',
    );
    assert.ok(
      subnetGroup.Subnets && subnetGroup.Subnets.length > 0,
      'DB subnet group should have subnets',
    );
  });

  it('should create a security group with correct ingress rules', async () => {
    const database = ctx.outputs.defaultDb.value;
    const vpc = ctx.outputs.vpc.value;
    const dbSecurityGroupId = database.dbSecurityGroup.id;

    const command = new DescribeSecurityGroupsCommand({
      GroupIds: [dbSecurityGroupId],
    });
    const { SecurityGroups } = await ctx.clients.ec2.send(command);
    assert.ok(
      SecurityGroups && SecurityGroups.length > 0,
      'DB security groups should exist',
    );
    const [securityGroup] = SecurityGroups;
    assert.strictEqual(
      securityGroup.VpcId,
      vpc.vpc.vpcId,
      'DB security group should be in the correct VPC',
    );

    const postgresRule = securityGroup.IpPermissions?.find(
      (rule: IpPermission) => rule.FromPort === 5432 && rule.ToPort === 5432,
    );
    assert.ok(postgresRule, 'Should have postgres port 5432 ingress rule');
    assert.strictEqual(
      postgresRule.IpProtocol,
      'tcp',
      'Should allow TCP protocol',
    );
  });

  it('should create a correctly configured RDS KMS key', async () => {
    const database = ctx.outputs.defaultDb.value;
    const kmsKeyId = database.kmsKeyId;

    const describeCommand = new DescribeKeyCommand({
      KeyId: kmsKeyId,
    });
    const { KeyMetadata } = await ctx.clients.kms.send(describeCommand);
    assert.strictEqual(
      KeyMetadata?.KeySpec,
      'SYMMETRIC_DEFAULT',
      'KMS key should use SYMMETRIC_DEFAULT spec',
    );
    assert.strictEqual(
      KeyMetadata.KeyUsage,
      'ENCRYPT_DECRYPT',
      'KMS key should be used for encryption/decryption',
    );
    assert.strictEqual(KeyMetadata.Enabled, true, 'KMS key should be enabled');
    assert.strictEqual(
      KeyMetadata.MultiRegion,
      false,
      'KMS key should not be multi-region',
    );

    const rotationCmd = new GetKeyRotationStatusCommand({ KeyId: kmsKeyId });
    const { KeyRotationEnabled } = await ctx.clients.kms.send(rotationCmd);
    assert.strictEqual(
      KeyRotationEnabled,
      true,
      'KMS key rotation should be enabled',
    );
  });
});
