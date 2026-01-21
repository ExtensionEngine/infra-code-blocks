import {
  DescribeDBInstancesCommand,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-rds';
import {
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testConfigurableDb(ctx: DatabaseTestContext) {
  it('should create a database', async () => {
    const configurableDb = ctx.outputs.configurableDb.value;

    assert.ok(configurableDb, 'Database should be defined');
    assert.strictEqual(
      configurableDb.name,
      `${ctx.config.appName}-configurable`,
      'Database should have correct name',
    );
    assert.ok(configurableDb.instance, 'Database instance should be defined');

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: configurableDb.instance.dbInstanceIdentifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances && DBInstances.length === 1,
      'Database instance should be created',
    );
    const [DBInstance] = DBInstances;
    assert.strictEqual(
      DBInstance.DBInstanceIdentifier,
      configurableDb.instance.dbInstanceIdentifier,
      'Database instance identifier should match',
    );
  });

  it('should properly configure instance', () => {
    const configurableDb = ctx.outputs.configurableDb.value;

    assert.strictEqual(
      configurableDb.instance.applyImmediately,
      ctx.config.applyImmediately,
      'Apply immediately argument should be set correctly',
    );
    assert.strictEqual(
      configurableDb.instance.allowMajorVersionUpgrade,
      ctx.config.allowMajorVersionUpgrade,
      'Allow major version upgrade argument should be set correctly',
    );
    assert.strictEqual(
      configurableDb.instance.autoMinorVersionUpgrade,
      ctx.config.autoMinorVersionUpgrade,
      'Auto minor version upgrade argument should be set correctly',
    );
  });

  it('should properly configure password', () => {
    const configurableDb = ctx.outputs.configurableDb.value;

    assert.ok(configurableDb.password, 'Password should exist');
    assert.strictEqual(
      configurableDb.instance.masterUserPassword,
      ctx.config.dbPassword,
      'Master user password should be set correctly',
    );
  });

  it('should properly configure storage', () => {
    const configurableDb = ctx.outputs.configurableDb.value;

    assert.strictEqual(
      configurableDb.instance.allocatedStorage,
      ctx.config.allocatedStorage.toString(),
      'Allocated storage argument should be set correctly',
    );
    assert.strictEqual(
      configurableDb.instance.maxAllocatedStorage,
      ctx.config.maxAllocatedStorage,
      'Max allocated storage argument should be set correctly',
    );
  });

  it('should properly configure monitoring options', () => {
    const configurableDb = ctx.outputs.configurableDb.value;

    assert.strictEqual(
      configurableDb.instance.enablePerformanceInsights,
      true,
      'Performance insights should be enabled',
    );
    assert.strictEqual(
      configurableDb.instance.performanceInsightsRetentionPeriod,
      7,
      'Performance insights retention period should be set correctly',
    );
    assert.strictEqual(
      configurableDb.instance.monitoringInterval,
      60,
      'Monitoring interval should be set correctly',
    );
    assert.ok(
      configurableDb.instance.monitoringRoleArn,
      'Monitoring role ARN should exist',
    );
  });

  it('should create monitoring IAM role and attach correct policy', async () => {
    const configurableDb = ctx.outputs.configurableDb.value;
    const roleName = configurableDb.monitoringRole.name;

    const roleCommand = new GetRoleCommand({
      RoleName: roleName,
    });
    const { Role } = await ctx.clients.iam.send(roleCommand);
    assert.ok(Role, 'Monitoring IAM role should exist');

    const policyCommand = new ListAttachedRolePoliciesCommand({
      RoleName: roleName,
    });
    const { AttachedPolicies } = await ctx.clients.iam.send(policyCommand);
    assert.ok(
      AttachedPolicies && AttachedPolicies.length > 0,
      'Attached policies should exist',
    );
    const [attachedPolicy] = AttachedPolicies;
    assert.strictEqual(
      attachedPolicy.PolicyArn,
      'arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole',
      'Monitoring IAM role should have correct policy attached',
    );
  });

  it('should properly configure kms', () => {
    const configurableDb = ctx.outputs.configurableDb.value;
    const kms = ctx.outputs.kms.value;

    assert.ok(configurableDb.kmsKeyId, 'Kms key id should exist');
    assert.strictEqual(
      configurableDb.instance.kmsKeyId,
      kms.arn,
      'Kms key id should be set correctly',
    );
  });

  it('should properly configure parameter group', () => {
    const configurableDb = ctx.outputs.configurableDb.value;
    const paramGroup = ctx.outputs.paramGroup.value;

    assert.strictEqual(
      configurableDb.instance.dbParameterGroupName,
      paramGroup.name,
      'Parameter group name should be set correctly',
    );
  });

  it('should properly configure tags', async () => {
    const configurableDb = ctx.outputs.configurableDb.value;

    const command = new ListTagsForResourceCommand({
      ResourceName: configurableDb.instance.dbInstanceArn,
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
