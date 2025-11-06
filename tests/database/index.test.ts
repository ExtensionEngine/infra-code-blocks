import { describe, it, before, after } from 'node:test';
import { DescribeDBSubnetGroupsCommand, RDSClient } from '@aws-sdk/client-rds';
import { DescribeKeyCommand, GetKeyRotationStatusCommand, KMSClient } from '@aws-sdk/client-kms';
import { DescribeSecurityGroupsCommand, EC2Client, IpPermission } from '@aws-sdk/client-ec2';
import * as assert from 'node:assert';
import * as automation from '../automation';
import * as config from './infrastructure/config';
import { DatabaseTestContext } from './test-context';
import { InlineProgramArgs } from "@pulumi/pulumi/automation";

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-database',
  program: () => import('./infrastructure'),
};

// TODO: Add tests for monitoring role & encrypted snapshot copy

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
    }
  }

  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  it('should create a Database with the correct configuration', () => {
    const database = ctx.outputs.database.value;
    const project = ctx.outputs.project.value;
    assert.ok(database, 'Database should be defined');
    assert.strictEqual(
      database.name,
      ctx.config.instanceName,
      'Database should have correct name',
    );
    assert.ok(database.dbSecurityGroup, 'Security group should be defined');
    assert.ok(database.dbSubnetGroup, 'Subnet group should be defined');
    assert.ok(database.kms, 'Encryption key should be defined');
    assert.ok(database.password, 'Password should be defined');
    assert.strictEqual(database.instance.dbName, config.dbName, 'Db name argument should be set correctly');
    assert.strictEqual(database.instance.username, config.username, 'Username argument should be set correctly');
    assert.strictEqual(database.instance.password, config.password, 'Password argument should be set correctly');
    assert.strictEqual(database.instance.applyImmediately, config.applyImmediately, 'Apply immediately argument should be set correctly');
    assert.strictEqual(database.instance.skipFinalSnapshot, config.skipFinalSnapshot, 'Skip final snapshot argument should be set correctly');
  });

  it('should create subnet group in the correct VPC', async () => {
    const database = ctx.outputs.database.value;
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
      'Subnet group should be in the correct VPC',
    );
    assert.ok(
      subnetGroup.Subnets && subnetGroup.Subnets.length > 0,
      'Subnet group should have subnets',
    );
  });

  it('should create a security group with correct ingress rules', async () => {
    const database = ctx.outputs.database.value;
    const vpc = ctx.outputs.vpc.value;
    const dbSecurityGroupId = database.dbSecurityGroup.id;

    const command = new DescribeSecurityGroupsCommand({
      GroupIds: [dbSecurityGroupId],
    });
    const { SecurityGroups } = await ctx.clients.ec2.send(command);
    assert.ok(
      SecurityGroups && SecurityGroups.length > 0,
      'Security groups should exist',
    );
    const [securityGroup] = SecurityGroups;
    assert.strictEqual(
      securityGroup.VpcId,
      vpc.vpc.vpcId,
      'Security group should be in the correct VPC',
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
    const database = ctx.outputs.database.value;
    const kmsKeyId = database.kms.id;

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
    assert.strictEqual(
      KeyMetadata.Enabled,
      true,
      'KMS key should be enabled',
    );
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
