import { it } from 'node:test';
import * as assert from 'node:assert';
import { backOff } from 'exponential-backoff';
import { EcsTestContext } from './test-context';
import { DescribeTargetGroupsCommand, DescribeTargetHealthCommand } from '@aws-sdk/client-elastic-load-balancing-v2';

export function testEcsServiceWithLb(ctx: EcsTestContext) {
  it('should properly configure load balancer when provided', async () => {
    const ecsService = ctx.outputs.ecsServiceWithLb.value;

    assert.ok(ecsService.service.loadBalancers &&
      ecsService.service.loadBalancers.length > 0,
      'Service should have load balancer configuration');

    const [lbConfig] = ecsService.service.loadBalancers;
    assert.strictEqual(lbConfig.containerName, 'sample-service', 'Load balancer should target correct container');
    assert.strictEqual(lbConfig.containerPort, 80, 'Load balancer should target correct port');

    const targetGroupArn = lbConfig.targetGroupArn;
    const describeTargetGroups = new DescribeTargetGroupsCommand({
      TargetGroupArns: [targetGroupArn]
    });
    const { TargetGroups } = await ctx.clients.elb.send(describeTargetGroups);

    assert.ok(TargetGroups && TargetGroups.length > 0, 'Target group should exist');
    assert.strictEqual(TargetGroups[0].TargetType, 'ip', 'Target group should be IP-based for Fargate');

    const describeHealth = new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupArn
    });

    return backOff(async () => {
      const { TargetHealthDescriptions } = await ctx.clients.elb.send(describeHealth);
      assert.ok(TargetHealthDescriptions && TargetHealthDescriptions.length > 0,
        'Target group should have registered targets');

      // At least one target should be healthy
      const healthyTargets = TargetHealthDescriptions.filter(
        (target: any) => target.TargetHealth?.State === 'healthy'
      );
      assert.ok(healthyTargets.length > 0, 'At least one target should be healthy');
    }, {
      ...ctx.config.exponentialBackOffConfig,
      numOfAttempts: 10,
    });
  });

  it('should be able to access the service via load balancer URL', async () => {
    const url = ctx.outputs.lbUrl.value;

    return backOff(async () => {
      const response = await fetch(url);
      assert.strictEqual(response.status, 200, 'HTTP request should return 200 OK');

      const text = await response.text();
      assert.ok(text.includes('Simple PHP App'),
        'Response should contain expected content');
    }, ctx.config.exponentialBackOffConfig);
  });
}
