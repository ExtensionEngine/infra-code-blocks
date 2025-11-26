import { DeleteDBSnapshotCommand, DescribeDBSnapshotsCommand, DescribeDBSubnetGroupsCommand } from '@aws-sdk/client-rds';
import { DescribeKeyCommand, GetKeyRotationStatusCommand } from '@aws-sdk/client-kms';
import { DescribeSecurityGroupsCommand, IpPermission } from '@aws-sdk/client-ec2';
import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testDefaultDb(ctx: DatabaseTestContext) {
  it('should create a database and all other resources', () => {
    const database = ctx.outputs.defaultDb.value;

    assert.ok(database, 'Database should be defined');
    assert.strictEqual(database.name, `${ctx.config.appName}-default-db`, 'Database should have correct name');

    assert.ok(database.instance, 'Db instance should be defined');
    assert.ok(database.dbSecurityGroup, 'Db security group should be defined');
    assert.ok(database.dbSubnetGroup, 'Db subnet group should be defined');
    assert.ok(database.kms, 'Kms key should be defined');
    assert.ok(database.password, 'Password should be defined');
  
  });

  it('should create database instance with correct default configuration', () => {
    const instance = ctx.outputs.defaultDb.value.instance;

    assert.strictEqual(instance.multiAz, false, 'Multi-AZ argument should be set to false');
    assert.strictEqual(instance.applyImmediately, false, 'Apply immediately argument should be set to false');
    assert.strictEqual(instance.skipFinalSnapshot, false, 'Skip final snapshot argument should be set to false');
    assert.strictEqual(instance.allocatedStorage, 20, 'Allocated storage argument should be set to 20');
    assert.strictEqual(instance.maxAllocatedStorage, 100, 'Max allocated storage argument should be set to 100');
    assert.strictEqual(instance.instanceClass, 'db.t4g.micro', 'Instance class argument should be set to db.t4g.micro');
    assert.strictEqual(instance.performanceInsightsEnabled, false, 'Performance insights enabled argument should be set to false');
    assert.strictEqual(instance.allowMajorVersionUpgrade, false, 'Allow major version upgrade argument should be set to false');
    assert.strictEqual(instance.autoMinorVersionUpgrade, true, 'Auto minor version upgrade argument should be set to true');
    assert.strictEqual(instance.engineVersion, '17.2', 'Engine version argument should be set to 17.2');

    assert.strictEqual(instance.engine, 'postgres', 'Engine argument should be set to postgres');
    assert.strictEqual(instance.storageEncrypted, true, 'Storage encrypted argument should be set to true');
    assert.strictEqual(instance.publiclyAccessible, false, 'Publicly accessible argument should be set to false');
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
}

export async function cleanupFinalSnapshot(ctx: DatabaseTestContext) {
    const database = ctx.outputs.defaultDb.value;
    const describeCommand = new DescribeDBSnapshotsCommand({
      DBInstanceIdentifier: database.instance.identifier,
    });
    const { DBSnapshots } = await ctx.clients.rds.send(describeCommand);
    if (!DBSnapshots || !DBSnapshots.length) return;
    const [snapshot] = DBSnapshots;
    const deleteCommand = new DeleteDBSnapshotCommand({
      DBSnapshotIdentifier: snapshot.DBSnapshotIdentifier
    });
    await ctx.clients.rds.send(deleteCommand);
}
