import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testDbWithCustomKms(ctx: DatabaseTestContext) {
  it('should properly configure kms', () => {
    const dbWithCustomKms = ctx.outputs.dbWithCustomKms.value;
    const customKms = ctx.outputs.customKms.value;
    
    assert.ok(dbWithCustomKms.kms,'Kms should exist');
    assert.strictEqual(
      dbWithCustomKms.instance.kmsKeyId,
      customKms.arn,
      'Kms key should be set correctly',
    );
  });
}
