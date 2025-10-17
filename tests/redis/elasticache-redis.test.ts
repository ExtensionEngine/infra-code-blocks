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
import { defaults as elastiCacheDefaults } from '../../src/v2/components/redis/elasticache-redis';
import { DescribeTasksCommand, ListTasksCommand } from '@aws-sdk/client-ecs';
import {
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

export function testElastiCacheRedis(ctx: RedisTestContext) {
  it('should create a default Redis cluster with the correct configuration', async () => {
    const redis = ctx.outputs.defaultElastiCacheRedis.value;
    assert.ok(redis, 'Redis instance should be defined');
    assert.strictEqual(
      redis.name,
      ctx.config.defaultElastiCacheRedisName,
      'Redis should have the correct name',
    );
    assert.ok(redis.cluster, 'Redis cluster should be defined');
    assert.ok(redis.securityGroup, 'Security group should be defined');
    assert.ok(redis.subnetGroup, 'Subnet group should be defined');
    assert.strictEqual(
      redis.cluster.engineVersion,
      elastiCacheDefaults.engineVersion,
      `Engine version should be ${elastiCacheDefaults.engineVersion}`,
    );
    assert.strictEqual(
      redis.cluster.parameterGroupName,
      elastiCacheDefaults.parameterGroupName,
      `Parameter group name should be ${elastiCacheDefaults.parameterGroupName}`,
    );
    assert.strictEqual(
      redis.cluster.nodeType,
      elastiCacheDefaults.nodeType,
      `Node type should be ${elastiCacheDefaults.nodeType}`,
    );
    assert.strictEqual(redis.cluster.port, 6379, 'Port should be 6379');
  });

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

  it('should connect to ElastiCache Redis instance', async () => {
    const testClient = ctx.outputs.testClient.value;
    assert.ok(testClient, 'Test client should be deployed');

    const success = await backOff(
      async () => {
        const listTasksCommand = new ListTasksCommand({
          cluster: ctx.outputs.cluster.value.name,
          serviceName: testClient.service.name,
        });
        const { taskArns } = await ctx.clients.ecs.send(listTasksCommand);
        if (!taskArns || taskArns.length === 0) {
          throw new Error('No running tasks found for test client');
        }

        const describeTasksCommand = new DescribeTasksCommand({
          cluster: ctx.outputs.cluster.value.name,
          tasks: taskArns,
        });
        const { tasks } = await ctx.clients.ecs.send(describeTasksCommand);

        if (!tasks || tasks.length === 0) {
          throw new Error('No task details found');
        }

        const logGroupNamePrefix = `/ecs/${ctx.config.elastiCacheTestClientName}-`;

        const describeLogGroupsCommand = new DescribeLogGroupsCommand({
          logGroupNamePrefix: logGroupNamePrefix,
        });

        const logGroupsResponse = await ctx.clients.cloudwatchLogs.send(
          describeLogGroupsCommand,
        );
        const logGroups = logGroupsResponse.logGroups;

        if (!logGroups || logGroups.length === 0) {
          throw new Error(
            'No log groups found with prefix: ' + logGroupNamePrefix,
          );
        }

        const logGroupName = logGroups[0].logGroupName;
        const logStreamsCommand = new DescribeLogStreamsCommand({
          logGroupName,
          orderBy: 'LastEventTime',
          descending: true,
        });

        const logStreamsResponse =
          await ctx.clients.cloudwatchLogs.send(logStreamsCommand);
        const logStreams = logStreamsResponse.logStreams;

        if (!logStreams || logStreams.length === 0) {
          throw new Error('No log streams found yet');
        }

        const getLogEventsCommand = new GetLogEventsCommand({
          logGroupName,
          logStreamName: logStreams[0].logStreamName,
          startFromHead: true,
        });

        const { events } =
          await ctx.clients.cloudwatchLogs.send(getLogEventsCommand);

        if (!events || events.length === 0) {
          throw new Error('No log events found yet');
        }

        const logContent = events.map(event => event.message).join('\n');

        if (logContent.includes('SUCCESS: Redis ping was successful')) {
          return true;
        }

        if (logContent.includes('ERROR:')) {
          throw new Error('Found error in test logs: ' + logContent);
        }

        return false;
      },
      {
        ...ctx.config.exponentialBackOffConfig,
        numOfAttempts: 10,
        startingDelay: 5000,
      },
    );

    assert.strictEqual(
      success,
      true,
      'Client should connect to ElastiCache Redis successfully',
    );
  });
}
