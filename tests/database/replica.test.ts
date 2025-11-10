import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testDbWithReplica(ctx: DatabaseTestContext) {
  it('should create a database replica with correct configuration', () => {
    const dbWithReplica = ctx.outputs.dbWithReplica.value;
   
    assert.ok(dbWithReplica.replica, 'Database replica should be defined');
    assert.strictEqual(
      dbWithReplica.instance.arn,
      dbWithReplica.replica.instance.replicateSourceDb,
      'Database replica should reference primary DB instance ID',
    );
  });
}
