import { it } from 'node:test';
import * as assert from 'node:assert';
import { EcsTestContext } from './test-context';
import {
  DescribeScalableTargetsCommand,
  DescribeScalingPoliciesCommand,
} from '@aws-sdk/client-application-auto-scaling';

export function testEcsServiceWithAutoscaling(ctx: EcsTestContext) {
  it('should create autoscaling resources when autoscaling is enabled', async () => {
    const ecsService = ctx.outputs.ecsServiceWithAutoscaling.value;
    const clusterName = ctx.outputs.cluster.value.name;
    const serviceName = ecsService.name;

    const resourceId = `service/${clusterName}/${serviceName}`;

    const targetsCommand = new DescribeScalableTargetsCommand({
      ServiceNamespace: 'ecs',
      ResourceIds: [resourceId],
      ScalableDimension: 'ecs:service:DesiredCount',
    });

    const { ScalableTargets } =
      await ctx.clients.appAutoscaling.send(targetsCommand);

    assert.ok(
      ScalableTargets && ScalableTargets.length > 0,
      'Autoscaling target should exist',
    );

    assert.strictEqual(
      ScalableTargets[0].MinCapacity,
      2,
      'Min capacity should match configuration',
    );
    assert.strictEqual(
      ScalableTargets[0].MaxCapacity,
      5,
      'Max capacity should match configuration',
    );
  });

  it('should create CPU and memory scaling policies', async () => {
    const ecsService = ctx.outputs.ecsServiceWithAutoscaling.value;
    const clusterName = ctx.outputs.cluster.value.name;
    const serviceName = ecsService.name;

    const resourceId = `service/${clusterName}/${serviceName}`;

    const policiesCommand = new DescribeScalingPoliciesCommand({
      ServiceNamespace: 'ecs',
      ResourceId: resourceId,
      ScalableDimension: 'ecs:service:DesiredCount',
    });

    const { ScalingPolicies } =
      await ctx.clients.appAutoscaling.send(policiesCommand);

    assert.ok(
      ScalingPolicies && ScalingPolicies.length > 0,
      'Autoscaling policies should exist',
    );
    assert.strictEqual(
      ScalingPolicies.length,
      2,
      'Should have 2 scaling policies (CPU and memory)',
    );

    const cpuPolicy = ScalingPolicies.find(
      (policy: any) =>
        policy.TargetTrackingScalingPolicyConfiguration
          ?.PredefinedMetricSpecification?.PredefinedMetricType ===
        'ECSServiceAverageCPUUtilization',
    );

    const memoryPolicy = ScalingPolicies.find(
      (policy: any) =>
        policy.TargetTrackingScalingPolicyConfiguration
          ?.PredefinedMetricSpecification?.PredefinedMetricType ===
        'ECSServiceAverageMemoryUtilization',
    );

    assert.ok(cpuPolicy, 'CPU autoscaling policy should exist');
    assert.ok(memoryPolicy, 'Memory autoscaling policy should exist');

    assert.strictEqual(
      cpuPolicy?.TargetTrackingScalingPolicyConfiguration?.TargetValue,
      70,
      'CPU policy target should be 70%',
    );
    assert.strictEqual(
      memoryPolicy?.TargetTrackingScalingPolicyConfiguration?.TargetValue,
      70,
      'Memory policy target should be 70%',
    );
  });
}
