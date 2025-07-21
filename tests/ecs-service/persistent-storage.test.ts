import { it } from 'node:test';
import * as assert from 'node:assert';
import {
  DescribeAccessPointsCommand,
  DescribeFileSystemsCommand,
  DescribeMountTargetsCommand,
  DescribeMountTargetSecurityGroupsCommand
} from '@aws-sdk/client-efs';
import { DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
  GetLogEventsCommand
} from '@aws-sdk/client-cloudwatch-logs';
import { DescribeTasksCommand, ListTasksCommand } from '@aws-sdk/client-ecs';
import { backOff } from 'exponential-backoff';
import { EcsTestContext } from './test-context';

export function testEcsServiceWithStorage(ctx: EcsTestContext) {
  it('should create EFS file system with correct configuration', async () => {
    const ecsServiceWithStorage = ctx.outputs.ecsServiceWithStorage.value;
    const efsFileSystem = ecsServiceWithStorage.persistentStorage.fileSystem;

    assert.ok(efsFileSystem, 'EFS file system should be created');

    const command = new DescribeFileSystemsCommand({
      FileSystemId: efsFileSystem.id
    });
    const { FileSystems } = await ctx.clients.efs.send(command);

    assert.ok(FileSystems && FileSystems.length === 1, 'File system should exist');
    assert.strictEqual(FileSystems[0].Encrypted, true, 'File system should be encrypted');
    assert.strictEqual(FileSystems[0].PerformanceMode, 'generalPurpose', 'Should use general purpose performance mode');
    assert.strictEqual(FileSystems[0].ThroughputMode, 'bursting', 'Should use bursting throughput mode');
  });

  it('should create security group for EFS with correct rules', async () => {
    const ecsServiceWithStorage = ctx.outputs.ecsServiceWithStorage.value;
    const vpc = ctx.outputs.project.value.vpc;

    const describeMountTargetsCommand = new DescribeMountTargetsCommand({
      FileSystemId: ecsServiceWithStorage.persistentStorage.fileSystem.id
    });
    const { MountTargets } = await ctx.clients.efs.send(describeMountTargetsCommand);

    assert.ok(MountTargets && MountTargets.length > 0, 'Mount targets should exist');

    const describeSecurityGroupsCommand = new DescribeMountTargetSecurityGroupsCommand({
      MountTargetId: MountTargets[0].MountTargetId
    });
    const { SecurityGroups } = await ctx.clients.efs.send(describeSecurityGroupsCommand);

    assert.ok(SecurityGroups && SecurityGroups.length > 0, 'Security groups should be attached to mount target');

    const ec2DescribeSecurityGroupsCommand = new DescribeSecurityGroupsCommand({
      GroupIds: SecurityGroups
    });
    const { SecurityGroups: securityGroupDetails } = await ctx.clients.ec2.send(ec2DescribeSecurityGroupsCommand);

    assert.ok(securityGroupDetails && securityGroupDetails.length > 0, 'Security group details should be available');

    const efsSecurityGroup = securityGroupDetails.find(sg =>
      sg.IpPermissions?.some(permission =>
        permission.FromPort === 2049 &&
        permission.ToPort === 2049 &&
        permission.IpProtocol === 'tcp'
      )
    );

    assert.ok(efsSecurityGroup, 'EFS security group with port 2049 should exist');
    assert.ok(efsSecurityGroup.GroupName?.includes(ecsServiceWithStorage.name),
      'Security group should have correct name');

    const nfsRule = efsSecurityGroup.IpPermissions?.find(p => p.FromPort === 2049);
    assert.ok(nfsRule?.IpRanges?.some(range => range.CidrIp === vpc.vpc.cidrBlock),
      'Security group should allow access from VPC CIDR');
  });

  it('should create mount targets in all private subnets', async () => {
    const ecsServiceWithStorage = ctx.outputs.ecsServiceWithStorage.value;
    const vpc = ctx.outputs.project.value.vpc;

    const command = new DescribeMountTargetsCommand({
      FileSystemId: ecsServiceWithStorage.persistentStorage.fileSystem.id
    });
    const { MountTargets } = await ctx.clients.efs.send(command);

    assert.ok(MountTargets, 'Mount targets should exist');

    const privateSubnetIds = vpc.privateSubnetIds;
    assert.strictEqual(MountTargets.length, privateSubnetIds.length,
      'Should have a mount target for each private subnet');

    privateSubnetIds.forEach((subnetId: any) => {
      const hasTarget = MountTargets.some(target => target.SubnetId === subnetId);
      assert.ok(hasTarget, `Subnet ${subnetId} should have a mount target`);
    });
  });

  it('should create an EFS access point with correct configuration', async () => {
    const ecsServiceWithStorage = ctx.outputs.ecsServiceWithStorage.value;
    const accessPoint = ecsServiceWithStorage.persistentStorage.accessPoint;

    assert.ok(accessPoint, 'Access point should be created');

    const command = new DescribeAccessPointsCommand({
      AccessPointId: accessPoint.id
    });
    const { AccessPoints } = await ctx.clients.efs.send(command);

    assert.ok(AccessPoints && AccessPoints.length === 1, 'Access point should exist');
    const ap = AccessPoints[0];

    assert.strictEqual(ap.PosixUser?.Uid, 1000, 'Should use UID 1000');
    assert.strictEqual(ap.PosixUser?.Gid, 1000, 'Should use GID 1000');

    assert.strictEqual(ap.RootDirectory?.Path, '/data', 'Root directory should be /data');
    assert.strictEqual(ap.RootDirectory?.CreationInfo?.OwnerUid, 1000, 'Owner UID should be 1000');
    assert.strictEqual(ap.RootDirectory?.CreationInfo.OwnerGid, 1000, 'Owner GID should be 1000');
    assert.strictEqual(ap.RootDirectory?.CreationInfo.Permissions, '0755', 'Permissions should be 0755');
  });

  it('should configure task definition with EFS volumes', async () => {
    const ecsServiceWithStorage = ctx.outputs.ecsServiceWithStorage.value;

    const taskDef = ecsServiceWithStorage.taskDefinition;

    assert.ok(taskDef.volumes && taskDef.volumes.length > 0, 'Task definition should have volumes');

    const efsVolume = taskDef.volumes[0];
    assert.ok(efsVolume.efsVolumeConfiguration, 'Volume should have EFS configuration');
    assert.strictEqual(efsVolume.efsVolumeConfiguration.fileSystemId,
      ecsServiceWithStorage.persistentStorage.fileSystem.id,
      'Volume should reference correct EFS file system');
    assert.strictEqual(efsVolume.efsVolumeConfiguration.transitEncryption, 'ENABLED',
      'Transit encryption should be enabled');
    assert.strictEqual(efsVolume.efsVolumeConfiguration.authorizationConfig.accessPointId,
      ecsServiceWithStorage.persistentStorage.accessPoint.id,
      'Should use correct access point');
    assert.strictEqual(efsVolume.efsVolumeConfiguration.authorizationConfig.iam, 'ENABLED',
      'IAM authorization should be enabled');
  });

  it('should configure container with mount points', async () => {
    const ecsServiceWithStorage = ctx.outputs.ecsServiceWithStorage.value;

    const containerDefs = JSON.parse(ecsServiceWithStorage.taskDefinition.containerDefinitions);
    assert.ok(containerDefs && containerDefs.length > 0, 'Container definitions should exist');

    const container = containerDefs[0];
    assert.ok(container.mountPoints && container.mountPoints.length > 0,
      'Container should have mount points');

    const mountPoint = container.mountPoints[0];
    assert.strictEqual(mountPoint.sourceVolume, 'data-volume', 'Should reference correct volume');
    assert.strictEqual(mountPoint.containerPath, '/data', 'Should mount at correct container path');
    assert.strictEqual(mountPoint.readOnly, false, 'Should be writeable by default');
  });

  it('should successfully write to and read from EFS volume', async () => {
    const ecsServiceWithStorage = ctx.outputs.ecsServiceWithStorage.value;
    const clusterName = ctx.outputs.cluster.value.name;
    const region = process.env.AWS_REGION || 'us-east-2';
    const logsClient = new CloudWatchLogsClient({ region });

    const listCommand = new ListTasksCommand({
      cluster: clusterName,
      family: ecsServiceWithStorage.taskDefinition.family
    });
    const { taskArns } = await ctx.clients.ecs.send(listCommand);
    assert.ok(taskArns && taskArns.length > 0, 'Task should be running');

    const describeTasksCommand = new DescribeTasksCommand({
      cluster: clusterName,
      tasks: taskArns
    });
    const { tasks = [] } = await ctx.clients.ecs.send(describeTasksCommand);
    const [task] = tasks;
    const container = task?.containers?.find(c => c.name === 'test-container');
    assert.ok(container, 'Test container should exist in task');

    // Determine log stream name - typically follows a pattern like:
    // ecs/container-name/task-id
    const taskId = task?.taskArn?.split('/').pop();

    const describeStreamsCommand = new DescribeLogStreamsCommand({
      logGroupName: ecsServiceWithStorage.logGroup.name,
      logStreamNamePrefix: `ecs/test-container/${taskId}`
    });

    return backOff(async () => {
      const { logStreams = [] } = await logsClient.send(describeStreamsCommand);
      assert.ok(logStreams.length > 0, 'Log stream should exist');

      const getLogsCommand = new GetLogEventsCommand({
        logGroupName: ecsServiceWithStorage.logGroup.name,
        logStreamName: logStreams[0].logStreamName,
        startFromHead: true
      });

      const { events } = await logsClient.send(getLogsCommand);
      assert.ok(events && events.length > 0, 'Log events should exist');

      const logContent = events.map(e => e.message).join('\n');
      assert.ok(
        logContent.includes('Successfully wrote to and read from EFS volume'),
        'Logs should indicate successful EFS operation'
      );
      assert.ok(
        !logContent.includes('Failed to write to or read from EFS volume'),
        'Logs should not contain failure messages'
      );
    }, {
      ...ctx.config.exponentialBackOffConfig,
      numOfAttempts: 8,
    });
  });

  it('should create ECS service when empty volumes array argument is passed', async () => {
    const ecsService = ctx.outputs.ecsServiceWithEmptyVolumes.value;
    assert.ok(ecsService, 'ECS Service should be defined');
    assert.strictEqual(ecsService.service.persistentStorage, undefined, 'Service should not have any storage');
  });

  it('should create ECS service when empty output volumes array argument is passed', async () => {
    const ecsService = ctx.outputs.ecsServiceWithOutputEmptyVolumes.value;
    assert.ok(ecsService, 'ECS Service should be defined');
    assert.strictEqual(ecsService.service.persistentStorage, undefined, 'Service should not have any storage');
  });
}
