import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { DescribeDBParameterGroupsCommand } from '@aws-sdk/client-rds';
import { it } from 'node:test';

export function testDbWithCustomParamGroup(ctx: DatabaseTestContext) {
  it('should properly configure parameter group', () => {
    const dbWithCustomParamGroup = ctx.outputs.dbWithCustomParamGroup.value;
    
    assert.ok(
      dbWithCustomParamGroup.parameterGroup,
      'Parameter group should exist',
    );
    assert.strictEqual(
      dbWithCustomParamGroup.instance.dbParameterGroupName,
      dbWithCustomParamGroup.parameterGroup.name,
      'Parameter group name should be set correctly',
    );
  });

  it('should create parameter group with correct family', async () => {
    const dbWithCustomParamGroup = ctx.outputs.dbWithCustomParamGroup.value;
    const parameterGroupName = dbWithCustomParamGroup.parameterGroup.name;

    const command = new DescribeDBParameterGroupsCommand({
      DBParameterGroupName: parameterGroupName,
    });
    const { DBParameterGroups } = await ctx.clients.rds.send(command);
    assert.ok(
      DBParameterGroups && DBParameterGroups.length > 0,
      'DB parameter group should exist',
    );
    const [parameterGroup] = DBParameterGroups;
    assert.strictEqual(
      parameterGroup.DBParameterGroupFamily,
      'postgres17',
      'DB Parameter group family should be set correctly',
    );
  });
}
