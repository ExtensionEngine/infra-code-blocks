import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testDbFromSnapshot(ctx: DatabaseTestContext) {
  it('should properly configure snapshot', () => {
    const dbFromSnapshot = ctx.outputs.dbFromSnapshot.value;
    const snapshot = ctx.outputs.snapshot.value;

    assert.ok(
      dbFromSnapshot.instance.dbSnapshotIdentifier,
      'Db snapshot identifier should exist',
    );

    assert.strictEqual(
      dbFromSnapshot.encryptedSnapshotCopy.sourceDbSnapshotIdentifier,
      snapshot.dbSnapshotArn,
      'Encrtyped snapshot copy should have correct source db snapshot identifier',
    );
    assert.strictEqual(
      dbFromSnapshot.encryptedSnapshotCopy.targetDbSnapshotIdentifier,
      dbFromSnapshot.instance.dbSnapshotIdentifier,
      'Encrtyped snapshot copy should have the correct target db snapshot identifier',
    );
    assert.strictEqual(
      dbFromSnapshot.encryptedSnapshotCopy.kmsKeyId,
      dbFromSnapshot.kms.arn,
      'Encrtyped snapshot copy should have the correct ksm key id',
    );
  });
}
