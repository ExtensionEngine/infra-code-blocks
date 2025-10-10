import { it } from 'node:test';
import * as assert from 'node:assert';
import { backOff } from 'exponential-backoff';
import { RedisTestContext } from './test-context';
import {
  DescribeCacheClustersCommand,
  DescribeCacheSubnetGroupsCommand,
} from '@aws-sdk/client-elasticache';
import {
  DescribeSecurityGroupsCommand,
  IpPermission,
} from '@aws-sdk/client-ec2';

export function testElastiCacheRedis(ctx: RedisTestContext) {
  it('should create a Redis cluster with the correct configuration', async () => {
    const redis = ctx.outputs.elastiCacheRedis.value;
    assert.ok(redis, 'Redis instance should be defined');
    assert.strictEqual(
      redis.name,
      ctx.config.elastiCacheRedisName,
      'Redis should have the correct name',
    );
    assert.ok(redis.cluster, 'Redis cluster should be defined');
    assert.ok(redis.securityGroup, 'Security group should be defined');
    assert.ok(redis.subnetGroup, 'Subnet group should be defined');
    assert.strictEqual(
      redis.cluster.engineVersion,
      '6.x',
      'Engine version should be 6.x',
    );
    assert.strictEqual(
      redis.cluster.parameterGroupName,
      'default.redis6.x',
      'Parameter group name should be default.redis6.x',
    );
    assert.strictEqual(
      redis.cluster.nodeType,
      'cache.t4g.micro',
      'Node type should be cache.t4g.micro',
    );
    assert.strictEqual(redis.cluster.port, 6379, 'Port should be 6379');
  });

  it('should have a running Redis cluster with correct engine settings', async () => {
    const redis = ctx.outputs.elastiCacheRedis.value;
    const clusterId = redis.cluster.id;

    return backOff(async () => {
      const command = new DescribeCacheClustersCommand({
        CacheClusterId: clusterId,
        ShowCacheNodeInfo: true,
      });
      const { CacheClusters } = await ctx.clients.elasticache.send(command);
      assert.ok(
        CacheClusters && CacheClusters.length > 0,
        'Cluster should exist',
      );
      const [cluster] = CacheClusters;
      assert.strictEqual(
        cluster.CacheClusterStatus,
        'available',
        'Cluster should be available',
      );
      assert.strictEqual(cluster.Engine, 'redis', 'Should use Redis engine');
      assert.strictEqual(cluster.NumCacheNodes, 1, 'Should have 1 cache node');
    }, ctx.config.exponentialBackOffConfig);
  });

  it('should create a subnet group in the correct VPC', async () => {
    const redis = ctx.outputs.elastiCacheRedis.value;
    const project = ctx.outputs.project.value;
    const subnetGroupName = redis.subnetGroup.name;

    const command = new DescribeCacheSubnetGroupsCommand({
      CacheSubnetGroupName: subnetGroupName,
    });
    const { CacheSubnetGroups } = await ctx.clients.elasticache.send(command);
    assert.ok(
      CacheSubnetGroups && CacheSubnetGroups.length > 0,
      'Cache subnet groups should exist',
    );
    const [subnetGroup] = CacheSubnetGroups;
    assert.strictEqual(
      subnetGroup.VpcId,
      project.vpc.vpcId,
      'Subnet group should be in the correct VPC',
    );
    assert.ok(
      subnetGroup.Subnets && subnetGroup.Subnets.length > 0,
      'Subnet group should have subnets',
    );
  });

  it('should create a security group with correct ingress rules', async () => {
    const redis = ctx.outputs.elastiCacheRedis.value;
    const project = ctx.outputs.project.value;
    const sgId = redis.securityGroup.id;

    const command = new DescribeSecurityGroupsCommand({
      GroupIds: [sgId],
    });
    const { SecurityGroups } = await ctx.clients.ec2.send(command);
    assert.ok(
      SecurityGroups && SecurityGroups.length > 0,
      'Security groups should exist',
    );
    const [securityGroup] = SecurityGroups;
    assert.strictEqual(
      securityGroup.VpcId,
      project.vpc.vpcId,
      'Security group should be in the correct VPC',
    );

    const redisRule = securityGroup.IpPermissions?.find(
      (rule: IpPermission) => rule.FromPort === 6379 && rule.ToPort === 6379,
    );
    assert.ok(redisRule, 'Should have Redis port 6379 ingress rule');
    assert.strictEqual(
      redisRule.IpProtocol,
      'tcp',
      'Should allow TCP protocol',
    );
  });
}
