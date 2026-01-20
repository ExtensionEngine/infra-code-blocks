import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testReplicaDb(ctx: DatabaseTestContext) {
  it('should create a database replica', async () => {
    const replicaDb = ctx.outputs.replicaDb.value;

    assert.ok(replicaDb.replica, 'Replica should be defined');

    const dbInstance = replicaDb.instance;
    const replicaInstance = replicaDb.replica.instance;

    assert.strictEqual(
      replicaInstance.sourceDbInstanceIdentifier,
      dbInstance.dbInstanceIdentifier,
      'Replica instance should have correct source db instance identifier',
    );

    const { readReplicaDbInstanceIdentifiers } = dbInstance;
    assert.ok(
      readReplicaDbInstanceIdentifiers &&
        readReplicaDbInstanceIdentifiers.length === 1,
      'Database instance should have associated read replica instance',
    );
    const [readReplicaDbInstanceIdentifier] = readReplicaDbInstanceIdentifiers;
    assert.strictEqual(
      readReplicaDbInstanceIdentifier,
      replicaInstance.dbInstanceIdentifier,
      'Database instance should have correct replica associated',
    );
  });
}
