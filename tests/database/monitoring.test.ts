import {
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { it } from 'node:test';

export function testDbWithMonitoring(ctx: DatabaseTestContext) {
  it('should properly configure monitoring options', () => {
    const dbWithMonitoring = ctx.outputs.dbWithMonitoring.value;

    assert.strictEqual(
      dbWithMonitoring.instance.enablePerformanceInsights,
      true,
      'Performance insights should be enabled',
    );
    assert.strictEqual(
      dbWithMonitoring.instance.performanceInsightsRetentionPeriod,
      7,
      'Performance insights retention period should be set correctly',
    );
    assert.strictEqual(
      dbWithMonitoring.instance.monitoringInterval,
      60,
      'Monitoring interval should be set correctly',
    );
    assert.ok(
      dbWithMonitoring.instance.monitoringRoleArn,
      'Monitoring role ARN should exist',
    );
  });

  it('should create monitoring IAM role and attach correct policy', async () => {
    const dbWithMonitoring = ctx.outputs.dbWithMonitoring.value;
    const roleName = dbWithMonitoring.monitoringRole.name;

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
}
