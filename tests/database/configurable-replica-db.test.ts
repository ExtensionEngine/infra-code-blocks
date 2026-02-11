import {
  DescribeDBInstancesCommand,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-rds';
import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testConfigurableReplica(ctx: DatabaseTestContext) {
  it('should create a primary instance with a configurable replica', async () => {
    const configurableReplicaDb = ctx.outputs.configurableReplicaDb.value;
    const { dbInstanceIdentifier } = configurableReplicaDb.instance;

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: dbInstanceIdentifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances &&
        DBInstances.length === 1 &&
        DBInstances[0].DBInstanceIdentifier === dbInstanceIdentifier,
      'Primary database instance should be created',
    );
  });

  it('should create a replica', async () => {
    const configurableReplicaDb = ctx.outputs.configurableReplicaDb.value;
    const { identifier } = configurableReplicaDb.replica.instance;

    assert.ok(configurableReplicaDb.replica, 'Replica should be defined');

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: identifier,
    });
    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances &&
        DBInstances.length === 1 &&
        DBInstances[0].DBInstanceIdentifier === identifier,
      'Replica instance should be created',
    );
  });

  it('should properly configure replica instance', () => {
    const configurableReplicaDb = ctx.outputs.configurableReplicaDb.value;
    const replicaInstance = configurableReplicaDb.replica.instance;

    assert.strictEqual(
      replicaInstance.applyImmediately,
      ctx.config.applyImmediately,
      'Apply immediately argument should be set correctly',
    );
    assert.strictEqual(
      replicaInstance.allowMajorVersionUpgrade,
      ctx.config.allowMajorVersionUpgrade,
      'Allow major version upgrade argument should be set correctly',
    );
    assert.strictEqual(
      replicaInstance.autoMinorVersionUpgrade,
      ctx.config.autoMinorVersionUpgrade,
      'Auto minor version upgrade argument should be set correctly',
    );
  });

  it('should properly configure replica monitoring options', () => {
    const configurableReplicaDb = ctx.outputs.configurableReplicaDb.value;
    const replicaInstance = configurableReplicaDb.replica.instance;
    const primaryInstance = configurableReplicaDb.instance;

    assert.strictEqual(
      replicaInstance.performanceInsightsEnabled,
      true,
      'Performance insights should be enabled',
    );
    assert.strictEqual(
      replicaInstance.performanceInsightsRetentionPeriod,
      7,
      'Performance insights retention period should be set correctly',
    );
    assert.strictEqual(
      replicaInstance.monitoringInterval,
      60,
      'Monitoring interval should be set correctly',
    );
    assert.strictEqual(
      replicaInstance.monitoringRoleArn,
      primaryInstance.monitoringRoleArn,
      'Replica instance should use the same monitoring role as the primary instance',
    );
  });

  it('should properly configure replica parameter group', () => {
    const configurableReplicaDb = ctx.outputs.configurableReplicaDb.value;
    const replicaInstance = configurableReplicaDb.replica.instance;
    const paramGroup = ctx.outputs.paramGroup.value;

    assert.strictEqual(
      replicaInstance.parameterGroupName,
      paramGroup.name,
      'Parameter group name should be set correctly',
    );
  });

  it('should properly configure replica tags', async () => {
    const configurableReplicaDb = ctx.outputs.configurableReplicaDb.value;
    const replicaInstance = configurableReplicaDb.replica.instance;

    const command = new ListTagsForResourceCommand({
      ResourceName: replicaInstance.arn,
    });
    const { TagList } = await ctx.clients.rds.send(command);
    assert.ok(TagList && TagList.length > 0, 'Tags should exist');

    Object.entries(ctx.config.tags).map(([Key, Value]) => {
      const tag = TagList.find(tag => tag.Key === Key);
      assert.ok(tag, `${Key} tag should exist`);
      assert.strictEqual(
        tag.Value,
        Value,
        `${Key} tag should be set correctly`,
      );
    });
  });
}
