import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
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

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: dbInstance.dbInstanceIdentifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances && DBInstances.length === 1,
      'Database instance should be created',
    );
    const [DBInstance] = DBInstances;
    const { ReadReplicaDBInstanceIdentifiers } = DBInstance;
    assert.ok(
      ReadReplicaDBInstanceIdentifiers &&
        ReadReplicaDBInstanceIdentifiers.length === 1,
      'Database instance should have associated read replica instance',
    );
    const [ReadReplicaDBInstanceIdentifier] = ReadReplicaDBInstanceIdentifiers;
    assert.strictEqual(
      ReadReplicaDBInstanceIdentifier,
      replicaInstance.dbInstanceIdentifier,
      'Database instance should have correct replica instance associated',
    );
  });
}
