import { it } from 'node:test';
import * as assert from 'node:assert';
import * as aws from '@pulumi/aws';
import { EcsTestContext } from './test-context';
import { Unwrap } from '@pulumi/pulumi';

export function testEcsServiceWithSg(ctx: EcsTestContext) {
  it('should export security group when provided', () => {
    const ecsService = ctx.outputs.ecsServiceWithSg.value;
    const securityGroup = ctx.outputs.ecsSecurityGroup.value;

    assert.ok(
      ecsService.securityGroups.some(
        (sg: aws.ec2.SecurityGroup) => sg.id === securityGroup.id,
      ),
      'ECS service should export provided security group',
    );
  });

  it('should use security group to configure network settings when provided', () => {
    const ecsService = ctx.outputs.ecsServiceWithSg.value;
    const securityGroup = ctx.outputs.ecsSecurityGroup.value;
    const networkConfig = ecsService.service.networkConfiguration;

    assert.ok(
      networkConfig.securityGroups.includes(securityGroup.id),
      'Network setting should include provided security group',
    );
  });

  it('should not create security group with default rules', () => {
    const ecsService = ctx.outputs.ecsServiceWithSg.value;
    const vpc = ctx.outputs.vpc.value;

    const isDefault = (sg: aws.ec2.SecurityGroup) => {
      const ingress = sg.ingress as unknown as Unwrap<typeof sg.ingress>;
      const egress = sg.egress as unknown as Unwrap<typeof sg.egress>;

      return (
        sg.vpcId === vpc.vpc.vpcId &&
        ingress.length === 1 &&
        ingress[0].protocol === '-1' &&
        ingress[0].cidrBlocks?.length === 1 &&
        ingress[0].cidrBlocks.includes(vpc.vpc.vpc.cidrBlock) &&
        egress.length === 1 &&
        egress[0].protocol === '-1' &&
        egress[0].cidrBlocks?.length === 1 &&
        egress[0].cidrBlocks.includes('0.0.0.0/0')
      );
    };

    assert.ok(
      !ecsService.securityGroups.some(isDefault),
      'Security group with default rules should not be created',
    );
  });
}
