import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { it } from 'node:test';

export function testSnapshotDb(ctx: DatabaseTestContext) {
  it('should create a database', async () => {
    const snapshotDb = ctx.outputs.snapshotDb.value;

    assert.ok(snapshotDb, 'Database should be defined');
    assert.strictEqual(
      snapshotDb.name,
      `${ctx.config.appName}-snapshot-db`,
      'Database should have correct name',
    );
    assert.ok(snapshotDb.instance, 'Database instance should be defined');

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: snapshotDb.instance.dbInstanceIdentifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances && DBInstances.length === 1,
      'Database instance should be created',
    );
    const [DBInstance] = DBInstances;
    assert.strictEqual(
      DBInstance.DBInstanceIdentifier,
      snapshotDb.instance.dbInstanceIdentifier,
      'Database instance identifier should match',
    );
  });

  it('should create encrypted snapshot copy', () => {
    const snapshotDb = ctx.outputs.snapshotDb.value;

    assert.ok(
      snapshotDb.encryptedSnapshotCopy,
      'Encrypted snapshot copy should exist',
    );
  });

  it('should properly configure encrypted snapshot copy', () => {
    const snapshotDb = ctx.outputs.snapshotDb.value;
    const snapshot = ctx.outputs.snapshot.value;

    assert.strictEqual(
      snapshotDb.encryptedSnapshotCopy.sourceDbSnapshotIdentifier,
      snapshot.dbSnapshotArn,
      'Encrypted snapshot copy should have correct source db snapshot identifier',
    );
    assert.strictEqual(
      snapshotDb.encryptedSnapshotCopy.targetDbSnapshotIdentifier,
      `${snapshot.id}-encrypted-copy`,
      'Encrypted snapshot copy should have the correct target db snapshot identifier',
    );
    assert.strictEqual(
      snapshotDb.encryptedSnapshotCopy.kmsKeyId,
      snapshotDb.kmsKeyId,
      'Encrypted snapshot copy should have the correct ksm key id',
    );
  });

  it('should properly configure instance', () => {
    const snapshotDb = ctx.outputs.snapshotDb.value;

    assert.strictEqual(
      snapshotDb.instance.dbSnapshotIdentifier,
      snapshotDb.encryptedSnapshotCopy.targetDbSnapshotIdentifier,
      'Db snapshot identifier should be set correctly',
    );
  });
}
