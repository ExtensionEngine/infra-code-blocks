import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testReplicaDb(ctx: DatabaseTestContext) {
  it('should create a database replica', async () => {
    const replicaDb = ctx.outputs.replicaDb.value;

    assert.ok(replicaDb.replica, 'Replica should be defined');
    assert.strictEqual(
      replicaDb.replica.instance.sourceDbInstanceIdentifier,
      replicaDb.instance.dbInstanceIdentifier,
      'Replica instance should have correct source db instance identifier',
    );

    const { readReplicaDbInstanceIdentifiers } = replicaDb.instance;
    assert.ok(
      readReplicaDbInstanceIdentifiers &&
        readReplicaDbInstanceIdentifiers.length === 1,
      'Database instance should have associated read replica instance',
    );
    const [readReplicaDbInstanceIdentifier] = readReplicaDbInstanceIdentifiers;
    assert.strictEqual(
      readReplicaDbInstanceIdentifier,
      replicaDb.replica.instance.dbInstanceIdentifier,
      'Database instance should have correct replica associated',
    );
  });
}
