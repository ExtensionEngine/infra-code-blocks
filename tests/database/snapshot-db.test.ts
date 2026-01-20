import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testSnapshotDb(ctx: DatabaseTestContext) {
  it('should create and properly configure encrypted snapshot copy', () => {
    const snapshotDb = ctx.outputs.snapshotDb.value;
    const snapshot = ctx.outputs.snapshot.value;

    assert.ok(
      snapshotDb.encryptedSnapshotCopy,
      'Encrypted snapshot copy should exist',
    );

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
