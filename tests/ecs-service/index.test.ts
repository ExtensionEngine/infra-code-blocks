import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import {
  ECSClient,
  ListTasksCommand,
  DescribeTasksCommand,
  DescribeServicesCommand
} from '@aws-sdk/client-ecs';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ServiceDiscoveryClient } from '@aws-sdk/client-servicediscovery';
import { ApplicationAutoScalingClient } from '@aws-sdk/client-application-auto-scaling';
import { EFSClient } from '@aws-sdk/client-efs';
import { backOff } from 'exponential-backoff';
import * as automation from '../automation';
import { EcsTestContext } from './test-context';
import { testEcsServiceWithLb } from './load-balancer.test';
import { testEcsServiceWithStorage } from './persistent-storage.test';
import { testEcsServiceWithServiceDiscovery } from './service-discovery.test';
import { testEcsServiceWithAutoscaling } from './autoscaling.test';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-ecs-service',
  program: () => import('./infrastructure')
};

describe('EcsService component deployment', () => {
  const region = process.env.AWS_REGION || 'us-east-2';
  const ctx: EcsTestContext = {
    outputs: {},
    config: {
      minEcsName: 'ecs-test-min',
      exponentialBackOffConfig: {
        delayFirstAttempt: true,
        numOfAttempts: 5,
        startingDelay: 1000,
        timeMultiple: 2,
        jitter: 'full'
      }
    },
    clients: {
      ecs: new ECSClient({ region }),
      ec2: new EC2Client({ region }),
      elb: new ElasticLoadBalancingV2Client({ region }),
      sd: new ServiceDiscoveryClient({ region }),
      appAutoscaling: new ApplicationAutoScalingClient({ region }),
      efs: new EFSClient({ region })
    }
  };

  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  it('should create an ECS service with the correct configuration', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    assert.ok(ecsService, 'ECS Service should be defined');
    assert.strictEqual(ecsService.name, ctx.config.minEcsName, 'Service should have the correct name');
    assert.strictEqual(ecsService.service.launchType, 'FARGATE', 'Service should use FARGATE launch type');
    assert.strictEqual(ecsService.service.desiredCount, 1, 'Service should have 1 desired task');
    assert.strictEqual(ecsService.service.persistentStorage, undefined, 'Service should not have any storage');
  });

  it('should have a running ECS service with desired count of tasks', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    const clusterName = ctx.outputs.cluster.value.name;
    const serviceName = ecsService.name;

    return backOff(async () => {
      const command = new DescribeServicesCommand({
        cluster: clusterName,
        services: [serviceName]
      });
      const { services } = await ctx.clients.ecs.send(command);

      assert.ok(services && services.length > 0, 'Service should exist');
      const [service] = services;

      assert.strictEqual(service.status, 'ACTIVE', 'Service should be active');
      assert.strictEqual(
        service.desiredCount,
        service.runningCount,
        `Service should have ${service.desiredCount} running tasks`
      );
    }, ctx.config.exponentialBackOffConfig);
  });

  it('should have running tasks with the correct task definition', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    const clusterName = ctx.outputs.cluster.value.name;
    const taskDefArn = ecsService.taskDefinition.arn;

    const listCommand = new ListTasksCommand({
      cluster: clusterName,
      family: ecsService.taskDefinition.family
    });
    const { taskArns } = await ctx.clients.ecs.send(listCommand);

    assert.ok(taskArns && taskArns.length > 0, 'Tasks should be running');

    const describeCommand = new DescribeTasksCommand({
      cluster: clusterName,
      tasks: taskArns
    });
    const { tasks } = await ctx.clients.ecs.send(describeCommand);

    assert.ok(tasks && tasks.length, 'Tasks should exist');
    tasks.forEach(task => {
      assert.strictEqual(task.taskDefinitionArn, taskDefArn,
        'Task should use the correct task definition');
      assert.strictEqual(task.lastStatus, 'RUNNING', 'Task should be in RUNNING state');
    });
  });

  it('should create a task definition with the correct container configuration', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    const taskDef = ecsService.taskDefinition;
    assert.ok(taskDef, 'Task definition should be defined');

    const containerDefs = JSON.parse(taskDef.containerDefinitions);
    assert.strictEqual(
      containerDefs.length,
      1,
      'Should have 1 container definition'
    );
    assert.strictEqual(
      containerDefs[0].name,
      'sample-service',
      'Container should have correct name'
    );
    assert.strictEqual(
      containerDefs[0].image,
      'amazon/amazon-ecs-sample',
      'Container should use correct image'
    );
    assert.strictEqual(
      containerDefs[0].portMappings[0].containerPort,
      80,
      'Container should map port 80'
    );
  });

  it('should set the correct CPU and memory values', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    const taskDef = ecsService.taskDefinition;

    // Default size is 'small' (0.25 vCPU, 0.5 GB)
    assert.strictEqual(taskDef.cpu, '256', 'CPU should be 256 (0.25 vCPU)');
    assert.strictEqual(taskDef.memory, '512', 'Memory should be 512 MB');
  });

  it('should create a CloudWatch log group for the service', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    assert.ok(ecsService.logGroup, 'Log group should be defined');
    assert.strictEqual(
      ecsService.logGroup.retentionInDays,
      14,
      'Log group should have 14-day retention'
    );
    assert.ok(
      ecsService.logGroup.namePrefix.startsWith(`/ecs/${ctx.config.minEcsName}-`),
      'Log group should have correct name prefix'
    );
  });

  it('should create IAM roles with proper permissions', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    const taskDef = ecsService.taskDefinition;

    assert.ok(taskDef.executionRoleArn, 'Task execution role should be defined');
    assert.ok(taskDef.taskRoleArn, 'Task role should be defined');

    assert.ok(
      taskDef.executionRoleArn.includes(`${ctx.config.minEcsName}-task-exec-role`),
      'Execution role should have correct name'
    );
    assert.ok(
      taskDef.taskRoleArn.includes(`${ctx.config.minEcsName}-task-role`),
      'Task role should have correct name'
    );
  });

  it('should configure network settings correctly', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    const networkConfig = ecsService.service.networkConfiguration;

    assert.ok(networkConfig, 'Network configuration should be defined');
    assert.strictEqual(
      networkConfig.assignPublicIp,
      false,
      'Should not assign public IP by default'
    );
    assert.ok(
      networkConfig.securityGroups.length > 0,
      'Should have at least one security group'
    );
    assert.ok(
      networkConfig.subnets.length > 0,
      'Should have at least one subnet'
    );
  });

  it('should have security group with proper rules', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    const project = ctx.outputs.project.value;
    assert.ok(ecsService.securityGroups.length > 0, 'Should have security groups');

    const sg = ecsService.securityGroups[0];
    assert.ok(sg.ingress[0].cidrBlocks.includes(project.vpc.vpc.cidrBlock),
      'Ingress rule should allow traffic from VPC CIDR');
    assert.strictEqual(
      sg.egress[0].cidrBlocks[0],
      '0.0.0.0/0',
      'Egress rule should allow all outbound traffic'
    );
  });

  it('should create security group in the correct VPC', async () => {
    const ecsService = ctx.outputs.minimalEcsService.value;
    const project = ctx.outputs.project.value;
    assert.ok(ecsService.securityGroups.length > 0, 'Should have security groups');

    const sg = ecsService.securityGroups[0];
    const expectedVpcId = project.vpc.vpcId;

    assert.strictEqual(
      sg.vpcId,
      expectedVpcId,
      `Security group should be created in the correct VPC (expected: ${expectedVpcId}, got: ${sg.vpcId})`
    );
  });

  describe('With autoscaling', () => testEcsServiceWithAutoscaling(ctx));
  describe('With service discovery', () => testEcsServiceWithServiceDiscovery(ctx));
  describe('With persistent storage', () => testEcsServiceWithStorage(ctx));
  describe('With load balancer', () => testEcsServiceWithLb(ctx));
});
