import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import * as automation from '../automation';
import { VpcTestContext } from './test-context';
import {
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  DescribeRouteTablesCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  SubnetState,
  VpcState,
} from '@aws-sdk/client-ec2';
import { defaults as vpcDefaults } from '../../src/v2/components/vpc';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-vpc',
  program: () => import('./infrastructure'),
};

const region =
  process.env.AWS_REGION === 'eu-west-1' ? 'eu-north-1' : 'eu-west-1';
const ctx: VpcTestContext = {
  outputs: {},
  config: {},
  clients: {
    ec2: new EC2Client({ region }),
  },
};

describe('Vpc component deployment', () => {
  before(async () => {
    ctx.outputs = await automation.deploy(programArgs, region);
  });

  after(() => automation.destroy(programArgs));

  it('should create a default VPC with the correct configuration', async () => {
    const defaultVpc = ctx.outputs.defaultVpc.value;
    await testVpcConfiguration(
      ctx,
      defaultVpc.vpc.vpcId,
      6,
      vpcDefaults.numberOfAvailabilityZones,
    );
  });

  it('should create a VPC with the correct configuration', async () => {
    const vpcOutput = ctx.outputs.vpc.value;
    await testVpcConfiguration(ctx, vpcOutput.vpc.vpcId, 9, 3);
  });

  it('should have internet gateway for public subnets', async () => {
    const defaultVpc = ctx.outputs.defaultVpc.value;
    const vpcId = defaultVpc.vpc.vpcId;

    const igwResult = await ctx.clients.ec2.send(
      new DescribeInternetGatewaysCommand({
        Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }],
      }),
    );
    const igws = igwResult.InternetGateways || [];
    assert.strictEqual(
      igws.length,
      1,
      'Should have exactly one internet gateway',
    );

    const attachment = igws[0].Attachments?.find(a => a.VpcId === vpcId);
    assert.ok(attachment, 'Internet gateway attachment should exist');
    assert.strictEqual(
      attachment.State,
      'available',
      'Internet gateway attachment should be available',
    );
  });

  it('should have a route table for each subnet type', async () => {
    const defaultVpc = ctx.outputs.defaultVpc.value;

    const routeTablesResult = await ctx.clients.ec2.send(
      new DescribeRouteTablesCommand({
        Filters: [{ Name: 'vpc-id', Values: [defaultVpc.vpc.vpcId] }],
      }),
    );
    const routeTables = routeTablesResult.RouteTables || [];
    assert.ok(
      routeTables.length >= 3,
      'Should have route tables for different subnet types',
    );
  });

  it('should have NAT gateways for private subnets', async () => {
    const defaultVpc = ctx.outputs.defaultVpc.value;
    const vpcId = defaultVpc.vpc.vpcId;

    const natGwResult = await ctx.clients.ec2.send(
      new DescribeNatGatewaysCommand({
        Filter: [{ Name: 'vpc-id', Values: [vpcId] }],
      }),
    );
    const natGateways = natGwResult.NatGateways || [];
    assert.strictEqual(
      natGateways.length,
      vpcDefaults.numberOfAvailabilityZones,
      `Should have ${vpcDefaults.numberOfAvailabilityZones} NAT gateways`,
    );

    natGateways.forEach(nat => {
      assert.strictEqual(
        nat.State,
        'available',
        'NAT gateway should be available',
      );
    });
  });

  async function testVpcConfiguration(
    ctx: VpcTestContext,
    vpcId: string,
    expectedSubnetCount: number,
    expectedAzCount: number,
  ) {
    const vpcResult = await ctx.clients.ec2.send(
      new DescribeVpcsCommand({
        VpcIds: [vpcId],
      }),
    );
    const vpc = vpcResult.Vpcs?.[0];
    assert.ok(vpc, 'VPC should exist');
    assert.strictEqual(
      vpc.State,
      VpcState.available,
      'VPC should be available',
    );

    const subnetsResult = await ctx.clients.ec2.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      }),
    );
    const subnets = subnetsResult.Subnets || [];
    assert.ok(
      subnets.length === expectedSubnetCount,
      `Should have ${expectedSubnetCount} subnets defined`,
    );
    subnets.forEach(subnet => {
      assert.strictEqual(
        subnet.State,
        SubnetState.available,
        'Subnets should be available',
      );
    });

    const uniqueAzs = new Set(subnets.map(s => s.AvailabilityZone));
    assert.strictEqual(
      uniqueAzs.size,
      expectedAzCount,
      `Subnets should span ${expectedAzCount} availability zones`,
    );
  }
});
