import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testDbWithKms(ctx: DatabaseTestContext) {
  it('should properly configure kms', () => {
    const dbWithKms = ctx.outputs.dbWithKms.value;
    const kms = ctx.outputs.kms.value;

    assert.ok(dbWithKms.kms, 'Kms should exist');
    assert.strictEqual(
      dbWithKms.instance.kmsKeyId,
      kms.arn,
      'Kms key should be set correctly',
    );
  });
}
