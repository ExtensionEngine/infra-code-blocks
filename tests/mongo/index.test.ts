import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import {
  ECSClient,
  ListTasksCommand,
  DescribeTasksCommand,
} from '@aws-sdk/client-ecs';
import { EC2Client } from '@aws-sdk/client-ec2';
import { EFSClient, DescribeFileSystemsCommand } from '@aws-sdk/client-efs';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import {
  ServiceDiscoveryClient,
  ListServicesCommand,
} from '@aws-sdk/client-servicediscovery';
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { backOff } from 'exponential-backoff';
import * as automation from '../automation';
import { MongoTestContext } from './test-context';
import { testConfig } from './infrastructure/config';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-mongo',
  program: () => import('./infrastructure'),
};

describe.only('Mongo v2 component deployment and data persistence', () => {
  const region = process.env.AWS_REGION || 'us-east-2';
  const ctx: MongoTestContext = {
    outputs: {},
    config: testConfig,
    clients: {
      ecs: new ECSClient({ region }),
      ec2: new EC2Client({ region }),
      efs: new EFSClient({ region }),
      secretsManager: new SecretsManagerClient({ region }),
      servicediscovery: new ServiceDiscoveryClient({ region }),
      cloudwatchLogs: new CloudWatchLogsClient({ region }),
    },
  };

  before(async () => {
    const outputs = await automation.deploy(programArgs);
    ctx.outputs = outputs;
  });

  after(async () => {
    await automation.destroy(programArgs);
  });

  it.only('should deploy basic Mongo service with correct configuration', async () => {
    const basicMongo = ctx.outputs.basicMongo.value;

    assert.ok(basicMongo, 'Basic Mongo service should be deployed');
    assert.ok(basicMongo.service, 'ECS service should exist');
    assert.ok(basicMongo.password, 'Password component should exist');
    assert.ok(basicMongo.host, 'Host should be defined');
    assert.strictEqual(
      basicMongo.port,
      testConfig.mongoPort,
      'Port should match configuration',
    );
    assert.strictEqual(
      basicMongo.username,
      testConfig.mongoUser,
      'Username should match configuration',
    );
  });

  it('should create EFS file system for persistent storage', async () => {
    const basicMongo = ctx.outputs.basicMongo.value;
    const persistentStorage = basicMongo.service.persistentStorage;

    assert.ok(persistentStorage, 'Persistent storage should be created');
    assert.ok(persistentStorage.fileSystem, 'EFS file system should exist');

    const command = new DescribeFileSystemsCommand({
      FileSystemId: persistentStorage.fileSystem.id,
    });
    const { FileSystems } = await ctx.clients.efs.send(command);

    assert.ok(
      FileSystems && FileSystems.length === 1,
      'File system should exist',
    );
    assert.strictEqual(
      FileSystems[0].Encrypted,
      true,
      'File system should be encrypted',
    );
    assert.strictEqual(
      FileSystems[0].PerformanceMode,
      'generalPurpose',
      'Should use general purpose performance mode',
    );
    assert.strictEqual(
      FileSystems[0].ThroughputMode,
      'bursting',
      'Should use bursting throughput mode',
    );
  });

  it('should create password secret in AWS Secrets Manager', async () => {
    const basicMongo = ctx.outputs.basicMongo.value;
    const passwordSecret = basicMongo.password.secret;

    assert.ok(passwordSecret, 'Password secret should be created');

    const command = new GetSecretValueCommand({
      SecretId: passwordSecret.arn,
    });
    const response = await ctx.clients.secretsManager.send(command);

    assert.ok(response.SecretString, 'Secret should contain a password');
    assert.ok(
      response.SecretString.length >= 16,
      'Password should be at least 16 characters long',
    );
  });

  it('should register Mongo service for service discovery', async () => {
    const basicMongo = ctx.outputs.basicMongo.value;
    const serviceDiscovery = basicMongo.service.serviceDiscoveryService;

    assert.ok(serviceDiscovery, 'Service discovery should be enabled');

    const command = new ListServicesCommand({});
    const { Services } = await ctx.clients.servicediscovery.send(command);

    const mongoService = Services?.find(
      service => service.Name === testConfig.mongoTestName + '-basic',
    );
    assert.ok(
      mongoService,
      'Mongo service should be registered in service discovery',
    );
  });

  it.only('should successfully run data persistence test', async () => {
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

        const logGroupNamePrefix = `/ecs/${testConfig.mongoTestName}-client-`;

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

        if (logContent.includes('SUCCESS: Test data inserted successfully')) {
          console.log('✅ Found success message in logs');
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
      'Data persistence test should complete successfully',
    );
  });
});
