import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testDbWithSnapshot(ctx: DatabaseTestContext) {
  it('should properly configure snapshot', () => {
    const dbWithSnapshot = ctx.outputs.dbWithSnapshot.value;
    const snapshot = ctx.outputs.snapshot.value;

    assert.ok(
      dbWithSnapshot.instance.dbSnapshotIdentifier,
      'Db snapshot identifier should exist',
    );

    assert.strictEqual(
      dbWithSnapshot.encryptedSnapshotCopy.sourceDbSnapshotIdentifier,
      snapshot.dbSnapshotArn,
      'Encrtyped snapshot copy should have correct source db snapshot identifier',
    );
    assert.strictEqual(
      dbWithSnapshot.encryptedSnapshotCopy.targetDbSnapshotIdentifier,
      dbWithSnapshot.instance.dbSnapshotIdentifier,
      'Encrtyped snapshot copy should have the correct target db snapshot identifier',
    );
    assert.strictEqual(
      dbWithSnapshot.encryptedSnapshotCopy.kmsKeyId,
      dbWithSnapshot.kms.arn,
      'Encrtyped snapshot copy should have the correct ksm key id',
    );
  });
}
