import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { LocalProgramArgs } from '@pulumi/pulumi/automation';
import { ECSClient, DescribeServicesCommand, ListTasksCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs';
import { DescribeSecurityGroupsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { ElasticLoadBalancingV2Client, DescribeTargetGroupsCommand, DescribeTargetHealthCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  ServiceDiscoveryClient,
  GetNamespaceCommand,
  ListInstancesCommand
} from '@aws-sdk/client-servicediscovery';
import {
  ApplicationAutoScalingClient,
  DescribeScalableTargetsCommand,
  DescribeScalingPoliciesCommand
} from '@aws-sdk/client-application-auto-scaling';
import {
  EFSClient,
  DescribeFileSystemsCommand,
  DescribeAccessPointsCommand,
  DescribeMountTargetsCommand,
  DescribeMountTargetSecurityGroupsCommand
} from '@aws-sdk/client-efs';
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  DescribeLogStreamsCommand
} from '@aws-sdk/client-cloudwatch-logs';
import * as path from 'pathe';
import { backOff, IBackOffOptions } from 'exponential-backoff';
import * as automation from '../automation';

const programArgs: LocalProgramArgs = {
  stackName: 'dev',
  workDir: path.join(__dirname, 'infrastructure')
};

const minEcsName = 'ecs-test-min';
const exponentialBackOffConfig: Partial<IBackOffOptions> = {
  delayFirstAttempt: true,
  numOfAttempts: 5,
  startingDelay: 1000,
  timeMultiple: 2,
  jitter: 'full'
};

describe('ImprovedEcsService component deployment', () => {
  let outputs: any;
  let ecsClient: ECSClient;
  let ec2Client: EC2Client;
  let elbClient: ElasticLoadBalancingV2Client;
  let sdClient: ServiceDiscoveryClient;
  let appAutoscalingClient: ApplicationAutoScalingClient;
  let efsClient: EFSClient;

  before(async () => {
    outputs = await automation.deploy(programArgs);
    const region = process.env.AWS_REGION || 'us-east-2';
    ecsClient = new ECSClient({ region });
    ec2Client = new EC2Client({ region });
    elbClient = new ElasticLoadBalancingV2Client({ region });
    sdClient = new ServiceDiscoveryClient({ region });
    appAutoscalingClient = new ApplicationAutoScalingClient({ region });
    efsClient = new EFSClient({ region });
  });

  after(() => automation.destroy(programArgs));

  it('should create an ECS service with the correct configuration', async () => {
    const ecsService = outputs.minimalEcsService.value;
    assert.ok(ecsService, 'ECS Service should be defined');
    assert.strictEqual(ecsService.name, minEcsName, 'Service should have the correct name');
    assert.strictEqual(ecsService.service.launchType, 'FARGATE', 'Service should use FARGATE launch type');
    assert.strictEqual(ecsService.service.desiredCount, 1, 'Service should have 1 desired task');
  });

  it('should have a running ECS service with desired count of tasks', async () => {
    const ecsService = outputs.minimalEcsService.value;
    const clusterName = outputs.cluster.value.name;
    const serviceName = ecsService.name;

    return backOff(async () => {
      const command = new DescribeServicesCommand({
        cluster: clusterName,
        services: [serviceName]
      });
      const { services } = await ecsClient.send(command);

      assert.ok(services && services.length > 0, 'Service should exist');
      const service = services[0];

      assert.strictEqual(service.status, 'ACTIVE', 'Service should be active');
      assert.strictEqual(service.desiredCount, service.runningCount,
        `Service should have ${service.desiredCount} running tasks`);
    }, exponentialBackOffConfig);
  });

  it('should have tasks using the correct task definition', async () => {
    const ecsService = outputs.minimalEcsService.value;
    const clusterName = outputs.cluster.value.name;
    const taskDefArn = ecsService.taskDefinition.arn;

    const listCommand = new ListTasksCommand({
      cluster: clusterName,
      family: ecsService.taskDefinition.family
    });
    const { taskArns } = await ecsClient.send(listCommand);

    assert.ok(taskArns && taskArns.length > 0, 'Tasks should be running');

    const describeCommand = new DescribeTasksCommand({
      cluster: clusterName,
      tasks: taskArns
    });
    const { tasks } = await ecsClient.send(describeCommand);

    assert.ok(tasks && tasks.length, 'Tasks should exist');
    tasks.forEach(task => {
      assert.strictEqual(task.taskDefinitionArn, taskDefArn,
        'Task should use the correct task definition');
      assert.strictEqual(task.lastStatus, 'RUNNING', 'Task should be in RUNNING state');
    });
  });

  it('should create a task definition with the correct container configuration', async () => {
    const ecsService = outputs.minimalEcsService.value;
    const taskDef = ecsService.taskDefinition;
    assert.ok(taskDef, 'Task definition should be defined');

    const containerDefs = JSON.parse(taskDef.containerDefinitions);
    assert.strictEqual(containerDefs.length, 1, 'Should have 1 container definition');
    assert.strictEqual(containerDefs[0].name, 'sample-service', 'Container should have correct name');
    assert.strictEqual(containerDefs[0].image, 'amazon/amazon-ecs-sample', 'Container should use correct image');
    assert.strictEqual(containerDefs[0].portMappings[0].containerPort, 80, 'Container should map port 80');
  });

  it('should create a CloudWatch log group for the service', async () => {
    const ecsService = outputs.minimalEcsService.value;
    assert.ok(ecsService.logGroup, 'Log group should be defined');
    assert.strictEqual(ecsService.logGroup.retentionInDays, 14, 'Log group should have 14-day retention');
    assert.ok(ecsService.logGroup.namePrefix.startsWith(`/ecs/${minEcsName}-`), 'Log group should have correct name prefix');
  });

  it('should create IAM roles with proper permissions', async () => {
    const ecsService = outputs.minimalEcsService.value;
    const taskDef = ecsService.taskDefinition;

    assert.ok(taskDef.executionRoleArn, 'Task execution role should be defined');
    assert.ok(taskDef.taskRoleArn, 'Task role should be defined');

    // Verify role names follow expected pattern
    assert.ok(taskDef.executionRoleArn.includes(`${minEcsName}-ecs-task-exec-role`), 'Execution role should have correct name');
    assert.ok(taskDef.taskRoleArn.includes(`${minEcsName}-ecs-task-role`), 'Task role should have correct name');
  });

  it('should configure network settings correctly', async () => {
    const ecsService = outputs.minimalEcsService.value;
    const networkConfig = ecsService.service.networkConfiguration;

    assert.ok(networkConfig, 'Network configuration should be defined');
    assert.strictEqual(networkConfig.assignPublicIp, false, 'Should not assign public IP by default');
    assert.ok(networkConfig.securityGroups.length > 0, 'Should have at least one security group');
    assert.ok(networkConfig.subnets.length > 0, 'Should have at least one subnet');
  });

  it('should set the correct CPU and memory values', async () => {
    const ecsService = outputs.minimalEcsService.value;
    const taskDef = ecsService.taskDefinition;

    // Default size is 'small' (0.25 vCPU, 0.5 GB)
    assert.strictEqual(taskDef.cpu, '256', 'CPU should be 256 (0.25 vCPU)');
    assert.strictEqual(taskDef.memory, '512', 'Memory should be 512 MB');
  });

  it('should have security group with proper rules', async () => {
    const ecsService = outputs.minimalEcsService.value;
    const project = outputs.project.value;
    assert.ok(ecsService.securityGroups.length > 0, 'Should have security groups');

    const sg = ecsService.securityGroups[0];
    assert.ok(sg.ingress[0].cidrBlocks.includes(project.vpc.vpc.cidrBlock),
      'Ingress rule should allow traffic from VPC CIDR');
    assert.strictEqual(sg.egress[0].cidrBlocks[0], '0.0.0.0/0', 'Egress rule should allow all outbound traffic');
  });

  it('should create security group in the correct VPC', async () => {
    const ecsService = outputs.minimalEcsService.value;
    const project = outputs.project.value;
    assert.ok(ecsService.securityGroups.length > 0, 'Should have security groups');

    const sg = ecsService.securityGroups[0];
    const expectedVpcId = project.vpc.vpcId;

    assert.strictEqual(sg.vpcId, expectedVpcId,
      `Security group should be created in the correct VPC (expected: ${expectedVpcId}, got: ${sg.vpcId})`);
  });

  it('should properly configure load balancer when provided', async () => {
    const ecsService = outputs.ecsServiceWithLb.value;

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
    const { TargetGroups } = await elbClient.send(describeTargetGroups);

    assert.ok(TargetGroups && TargetGroups.length > 0, 'Target group should exist');
    assert.strictEqual(TargetGroups[0].TargetType, 'ip', 'Target group should be IP-based for Fargate');

    const describeHealth = new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupArn
    });

    return backOff(async () => {
      const { TargetHealthDescriptions } = await elbClient.send(describeHealth);
      assert.ok(TargetHealthDescriptions && TargetHealthDescriptions.length > 0,
        'Target group should have registered targets');

      // At least one target should be healthy
      const healthyTargets = TargetHealthDescriptions.filter(
        (target: any) => target.TargetHealth?.State === 'healthy'
      );
      assert.ok(healthyTargets.length > 0, 'At least one target should be healthy');
    }, {
      ...exponentialBackOffConfig,
      numOfAttempts: 10,
    });
  });

  it('should be able to access the service via load balancer URL', async () => {
    const url = outputs.lbUrl.value;

    return backOff(async () => {
      const response = await fetch(url);
      assert.strictEqual(response.status, 200, 'HTTP request should return 200 OK');

      const text = await response.text();
      assert.ok(text.includes('Simple PHP App'),
        'Response should contain expected content');
    }, exponentialBackOffConfig);
  });

  it('should create a private DNS namespace for service discovery', async () => {
    const ecsWithDiscovery = outputs.ecsWithDiscovery.value;
    const namespace = ecsWithDiscovery.serviceDiscoveryService?.namespaceId;

    assert.ok(namespace, 'Service discovery namespace should be created');

    const command = new GetNamespaceCommand({ Id: namespace });
    const { Namespace } = await sdClient.send(command);

    assert.ok(Namespace, 'Namespace should exist');
    assert.strictEqual(Namespace.Type, 'DNS_PRIVATE', 'Should be a private DNS namespace');
    assert.strictEqual(Namespace.Name, ecsWithDiscovery.name, 'Namespace name should match service name');
  });

  it('should register the service in service discovery', async () => {
    const ecsWithDiscovery = outputs.ecsWithDiscovery.value;
    const serviceId = ecsWithDiscovery.serviceDiscoveryService?.id;

    assert.ok(serviceId, 'Service discovery service should be created');

    return backOff(async () => {
      const command = new ListInstancesCommand({ ServiceId: serviceId });
      const { Instances } = await sdClient.send(command);

      assert.ok(Instances && Instances.length > 0, 'Service should have registered instances');
    }, exponentialBackOffConfig);
  });

  it('should create autoscaling resources when autoscaling is enabled', async () => {
    const ecsService = outputs.ecsServiceWithAutoscaling.value;
    const clusterName = outputs.cluster.value.name;
    const serviceName = ecsService.name;

    const resourceId = `service/${clusterName}/${serviceName}`;

    const targetsCommand = new DescribeScalableTargetsCommand({
      ServiceNamespace: 'ecs',
      ResourceIds: [resourceId],
      ScalableDimension: 'ecs:service:DesiredCount'
    });

    const { ScalableTargets } = await appAutoscalingClient.send(targetsCommand);

    assert.ok(ScalableTargets && ScalableTargets.length > 0, 'Autoscaling target should exist');

    assert.strictEqual(ScalableTargets[0].MinCapacity, 2, 'Min capacity should match configuration');
    assert.strictEqual(ScalableTargets[0].MaxCapacity, 5, 'Max capacity should match configuration');
  });

  it('should create CPU and memory scaling policies', async () => {
    const ecsService = outputs.ecsServiceWithAutoscaling.value;
    const clusterName = outputs.cluster.value.name;
    const serviceName = ecsService.name;

    const resourceId = `service/${clusterName}/${serviceName}`;

    const policiesCommand = new DescribeScalingPoliciesCommand({
      ServiceNamespace: 'ecs',
      ResourceId: resourceId,
      ScalableDimension: 'ecs:service:DesiredCount'
    });

    const { ScalingPolicies } = await appAutoscalingClient.send(policiesCommand);

    assert.ok(ScalingPolicies && ScalingPolicies.length > 0, 'Autoscaling policies should exist');
    assert.strictEqual(ScalingPolicies.length, 2, 'Should have 2 scaling policies (CPU and memory)');

    const cpuPolicy = ScalingPolicies.find((policy: any) =>
      policy.TargetTrackingScalingPolicyConfiguration?.PredefinedMetricSpecification?.PredefinedMetricType ===
      'ECSServiceAverageCPUUtilization'
    );

    const memoryPolicy = ScalingPolicies.find((policy: any) =>
      policy.TargetTrackingScalingPolicyConfiguration?.PredefinedMetricSpecification?.PredefinedMetricType ===
      'ECSServiceAverageMemoryUtilization'
    );

    assert.ok(cpuPolicy, 'CPU autoscaling policy should exist');
    assert.ok(memoryPolicy, 'Memory autoscaling policy should exist');

    assert.strictEqual(
      cpuPolicy?.TargetTrackingScalingPolicyConfiguration?.TargetValue,
      70,
      'CPU policy target should be 70%'
    );
    assert.strictEqual(
      memoryPolicy?.TargetTrackingScalingPolicyConfiguration?.TargetValue,
      70,
      'Memory policy target should be 70%'
    );
  });

  it('should create EFS file system with correct configuration', async () => {
    const ecsServiceWithStorage = outputs.ecsServiceWithStorage.value;
    const efsFileSystem = ecsServiceWithStorage.persistentStorage.fileSystem;

    assert.ok(efsFileSystem, 'EFS file system should be created');

    const command = new DescribeFileSystemsCommand({
      FileSystemId: efsFileSystem.id
    });
    const { FileSystems } = await efsClient.send(command);

    assert.ok(FileSystems && FileSystems.length === 1, 'File system should exist');
    assert.strictEqual(FileSystems[0].Encrypted, true, 'File system should be encrypted');
    assert.strictEqual(FileSystems[0].PerformanceMode, 'generalPurpose', 'Should use general purpose performance mode');
    assert.strictEqual(FileSystems[0].ThroughputMode, 'bursting', 'Should use bursting throughput mode');
  });

  it('should create security group for EFS with correct rules', async () => {
    const ecsServiceWithStorage = outputs.ecsServiceWithStorage.value;
    const vpc = outputs.project.value.vpc;

    // Get mount targets
    const describeMountTargetsCommand = new DescribeMountTargetsCommand({
      FileSystemId: ecsServiceWithStorage.persistentStorage.fileSystem.id
    });
    const { MountTargets } = await efsClient.send(describeMountTargetsCommand);

    assert.ok(MountTargets && MountTargets.length > 0, 'Mount targets should exist');

    // Get security groups for a mount target
    const describeSecurityGroupsCommand = new DescribeMountTargetSecurityGroupsCommand({
      MountTargetId: MountTargets[0].MountTargetId
    });
    const { SecurityGroups } = await efsClient.send(describeSecurityGroupsCommand);

    assert.ok(SecurityGroups && SecurityGroups.length > 0, 'Security groups should be attached to mount target');

    // Get security group details
    const ec2DescribeSecurityGroupsCommand = new DescribeSecurityGroupsCommand({
      GroupIds: SecurityGroups
    });
    const { SecurityGroups: securityGroupDetails } = await ec2Client.send(ec2DescribeSecurityGroupsCommand);

    assert.ok(securityGroupDetails && securityGroupDetails.length > 0, 'Security group details should be available');

    // Find the security group with our specific ingress rule
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

    // Check VPC CIDR rule
    const nfsRule = efsSecurityGroup.IpPermissions?.find(p => p.FromPort === 2049);
    assert.ok(nfsRule?.IpRanges?.some(range => range.CidrIp === vpc.vpc.cidrBlock),
      'Security group should allow access from VPC CIDR');
  });

  it('should create mount targets in all private subnets', async () => {
    const ecsServiceWithStorage = outputs.ecsServiceWithStorage.value;
    const vpc = outputs.project.value.vpc;

    const command = new DescribeMountTargetsCommand({
      FileSystemId: ecsServiceWithStorage.persistentStorage.fileSystem.id
    });
    const { MountTargets } = await efsClient.send(command);

    assert.ok(MountTargets, 'Mount targets should exist');

    // Check mount targets are created in each private subnet
    const privateSubnetIds = vpc.privateSubnetIds;
    assert.strictEqual(MountTargets.length, privateSubnetIds.length,
      'Should have a mount target for each private subnet');

    // Verify each subnet has a mount target
    privateSubnetIds.forEach((subnetId: any) => {
      const hasTarget = MountTargets.some(target => target.SubnetId === subnetId);
      assert.ok(hasTarget, `Subnet ${subnetId} should have a mount target`);
    });
  });

  it('should create an EFS access point with correct configuration', async () => {
    const ecsServiceWithStorage = outputs.ecsServiceWithStorage.value;
    const accessPoint = ecsServiceWithStorage.persistentStorage.accessPoint;

    assert.ok(accessPoint, 'Access point should be created');

    const command = new DescribeAccessPointsCommand({
      AccessPointId: accessPoint.id
    });
    const { AccessPoints } = await efsClient.send(command);

    assert.ok(AccessPoints && AccessPoints.length === 1, 'Access point should exist');
    const ap = AccessPoints[0];

    // Check POSIX user configuration
    assert.strictEqual(ap.PosixUser?.Uid, 1000, 'Should use UID 1000');
    assert.strictEqual(ap.PosixUser?.Gid, 1000, 'Should use GID 1000');

    // Check root directory configuration
    assert.strictEqual(ap.RootDirectory?.Path, '/data', 'Root directory should be /data');
    assert.strictEqual(ap.RootDirectory?.CreationInfo?.OwnerUid, 1000, 'Owner UID should be 1000');
    assert.strictEqual(ap.RootDirectory?.CreationInfo.OwnerGid, 1000, 'Owner GID should be 1000');
    assert.strictEqual(ap.RootDirectory?.CreationInfo.Permissions, '0755', 'Permissions should be 0755');
  });

  it('should configure task definition with EFS volumes', async () => {
    const ecsServiceWithStorage = outputs.ecsServiceWithStorage.value;

    // Get the task definition
    const taskDef = ecsServiceWithStorage.taskDefinition;

    // Check volumes configuration
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
    const ecsServiceWithStorage = outputs.ecsServiceWithStorage.value;

    // Get the container definitions
    const containerDefs = JSON.parse(ecsServiceWithStorage.taskDefinition.containerDefinitions);
    assert.ok(containerDefs && containerDefs.length > 0, 'Container definitions should exist');

    // Assuming first container has the mount points
    const container = containerDefs[0];
    assert.ok(container.mountPoints && container.mountPoints.length > 0,
      'Container should have mount points');

    // Verify mount point configuration
    const mountPoint = container.mountPoints[0];
    assert.strictEqual(mountPoint.sourceVolume, 'data-volume', 'Should reference correct volume');
    assert.strictEqual(mountPoint.containerPath, '/data', 'Should mount at correct container path');
    assert.strictEqual(mountPoint.readOnly, false, 'Should be writeable by default');
  });

  it('should successfully write to and read from EFS volume', async () => {
    const ecsServiceWithStorage = outputs.ecsServiceWithStorage.value;
    const clusterName = outputs.cluster.value.name;
    const region = process.env.AWS_REGION || 'us-east-2';
    const logsClient = new CloudWatchLogsClient({ region });

    const listCommand = new ListTasksCommand({
      cluster: clusterName,
      family: ecsServiceWithStorage.taskDefinition.family
    });
    const { taskArns } = await ecsClient.send(listCommand);
    assert.ok(taskArns && taskArns.length > 0, 'Task should be running');

    const describeTasksCommand = new DescribeTasksCommand({
      cluster: clusterName,
      tasks: taskArns
    });
    const { tasks = [] } = await ecsClient.send(describeTasksCommand);
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
      ...exponentialBackOffConfig,
      numOfAttempts: 8,
    });
  });
});
