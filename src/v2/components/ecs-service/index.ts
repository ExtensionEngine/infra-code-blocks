import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { ContainerDependency, HealthCheck } from '@aws-sdk/client-ecs';
import { InlinePolicy } from '../../../types/aws';
import { CustomSize, Size } from '../../../types/size';
import { PredefinedSize, commonTags } from '../../../constants';
import { assumeRolePolicy } from './policies';

const config = new pulumi.Config('aws');
const awsRegion = config.require('region');

namespace EcsService {
  export type PersistentStorageVolume = { name: pulumi.Input<string>; };

  export type PersistentStorageMountPoint = {
    sourceVolume: pulumi.Input<string>;
    containerPath: pulumi.Input<string>;
    readOnly?: pulumi.Input<boolean>;
  };

  export type PersistentStorage = {
    fileSystem: aws.efs.FileSystem,
    accessPoint: aws.efs.AccessPoint
  };

  export type Tags = pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;

  export type Container = {
    name: pulumi.Input<string>;
    image: pulumi.Input<string>;
    portMappings: pulumi.Input<aws.ecs.PortMapping>[];
    command?: pulumi.Input<string[]>;
    mountPoints?: PersistentStorageMountPoint[];
    environment?: pulumi.Input<aws.ecs.KeyValuePair[]>;
    secrets?: pulumi.Input<aws.ecs.Secret[]>;
    dependsOn?: pulumi.Input<ContainerDependency[]>;
    essential?: pulumi.Input<boolean>;
    healthcheck?: pulumi.Input<HealthCheck>
  };

  export type LoadBalancerConfig = {
    containerName: pulumi.Input<string>;
    containerPort: pulumi.Input<number>;
    targetGroupArn: aws.lb.TargetGroup['arn'];
  };


  export type Args = {
    clusterId: pulumi.Input<string>;
    clusterName: pulumi.Input<string>;
    vpc: pulumi.Input<awsx.ec2.Vpc>;
    containers: EcsService.Container[];

    volumes?: EcsService.PersistentStorageVolume[];

    /**
     * Number of instances of the task definition to place and keep running.
     * Default: 1
     */
    desiredCount?: pulumi.Input<number>;

    /**
     * CPU and memory size used for running the container. 
     * Available predefined options are:
     * - small (0.25 vCPU, 0.5 GB memory)
     * - medium (0.5 vCPU, 1 GB memory)
     * - large (1 vCPU memory, 2 GB memory)
     * - xlarge (2 vCPU, 4 GB memory)
     *
     * Default: "small"
     */
    size?: pulumi.Input<Size>;

    loadBalancers?: LoadBalancerConfig[];

    /**
     * Custom service security group
     * In case no security group is provided, default security group will be used.
     */
    securityGroup?: aws.ec2.SecurityGroup;

    /**
     * Assign public IP address to service.
     */
    assignPublicIp?: pulumi.Input<boolean>;

    taskExecutionRoleInlinePolicies?: pulumi.Input<
      pulumi.Input<InlinePolicy>[]
    >;
    taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<InlinePolicy>[]>;

    /**
     * Registers tasks with AWS Cloud Map and create discoverable DNS entries for each task.
     * Simplify service-to-service communication by enabling finding based on DNS records such as http://serviceName.local.
     * Default: false.
     */
    enableServiceAutoDiscovery?: pulumi.Input<boolean>;
    autoscaling?: pulumi.Input<{
      /**
       * Is autoscaling enabled or disabled. Defaults to false.
       */
      enabled: pulumi.Input<boolean>;
      /**
       * Min capacity of the scalable target. Defaults to 1.
       */
      minCount?: pulumi.Input<number>;
      /**
       * Max capacity of the scalable target. Defaults to 1.
       */
      maxCount?: pulumi.Input<number>;
    }>;

    /**
     * A map of tags to assign to the resource.
     */
    tags?: EcsService.Tags;
  };
}

/**
 * Standard directory permissions:
 * - Owner: read, write, execute (7)
 * - Group: read, execute (5)
 * - Others: read, execute (5)
 */
const STANDARD_DIRECTORY_PERMISSIONS = '0755';

const FIRST_POSIX_NON_ROOT_USER = {
  userId: 1000,
  groupId: 1000,
  permissions: STANDARD_DIRECTORY_PERMISSIONS
} as const;

const defaults = {
  desiredCount: 1,
  size: 'small',
  environment: [],
  secrets: [],
  volumes: [],
  enableServiceAutoDiscovery: false,
  assignPublicIp: false,
  taskExecutionRoleInlinePolicies: [],
  taskRoleInlinePolicies: [],
  autoscaling: {
    enabled: false,
    minCount: 1,
    maxCount: 1,
  },
};

export class EcsService extends pulumi.ComponentResource {
  name: string;
  vpc: pulumi.Output<awsx.ec2.Vpc>;
  logGroup: aws.cloudwatch.LogGroup;
  taskDefinition: pulumi.Output<aws.ecs.TaskDefinition>;
  taskExecutionRole: aws.iam.Role;
  taskRole: aws.iam.Role;
  service: pulumi.Output<aws.ecs.Service>;
  securityGroups: pulumi.Output<aws.ec2.SecurityGroup>[];
  serviceDiscoveryService?: aws.servicediscovery.Service;
  persistentStorage?: EcsService.PersistentStorage;

  constructor(
    name: string,
    args: EcsService.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:ecs:Servicev2', name, {}, opts);
    const argsWithDefaults = Object.assign({}, defaults, args);

    this.name = name;
    this.securityGroups = [];
    this.vpc = pulumi.output(argsWithDefaults.vpc);
    this.logGroup = this.createLogGroup();
    this.taskExecutionRole = this.createTaskExecutionRole(argsWithDefaults.taskExecutionRoleInlinePolicies);
    this.taskRole = this.createTaskRole(argsWithDefaults.taskRoleInlinePolicies)

    if (argsWithDefaults.volumes.length) {
      this.persistentStorage = this.createPersistentStorage(this.vpc);
    }

    this.taskDefinition = this.createTaskDefinition(
      argsWithDefaults.containers,
      argsWithDefaults.volumes,
      this.taskExecutionRole,
      this.taskRole,
      argsWithDefaults.size,
      { ...commonTags, ...argsWithDefaults.tags }
    );

    if (argsWithDefaults.enableServiceAutoDiscovery) {
      this.serviceDiscoveryService = this.createServiceDiscovery();
    }

    this.service = this.createEcsService(argsWithDefaults, opts);

    if (argsWithDefaults.autoscaling.enabled) {
      this.enableAutoscaling(
        pulumi.output(argsWithDefaults.clusterName),
        this.service.name,
        argsWithDefaults.autoscaling.minCount,
        argsWithDefaults.autoscaling.maxCount,
      );
    }

    this.registerOutputs();
  }

  public static createTcpPortMapping(port: number): aws.ecs.PortMapping {
    return {
      containerPort: port,
      hostPort: port,
      protocol: 'tcp'
    };
  }

  private createLogGroup() {
    const logGroup = new aws.cloudwatch.LogGroup(
      `${this.name}-log-group`,
      {
        retentionInDays: 14,
        namePrefix: `/ecs/${this.name}-`,
        tags: commonTags,
      },
      { parent: this },
    );
    return logGroup;
  }

  private createTaskDefinition(
    containers: EcsService.Container[],
    volumes: EcsService.PersistentStorageVolume[],
    taskExecutionRole: aws.iam.Role,
    taskRole: aws.iam.Role,
    size: pulumi.Input<Size>,
    tags: EcsService.Tags
  ): pulumi.Output<aws.ecs.TaskDefinition> {
    const stack = pulumi.getStack();
    const { cpu, memory } = pulumi.output(size).apply(parseSize);
    const containerDefinitions = containers.map(container => {
      return this.createContainerDefinition(container)
    });

    return pulumi.all(containerDefinitions).apply(containerDefinitions => {
      return new aws.ecs.TaskDefinition(`${this.name}-task-definition`, {
        family: `${this.name}-task-definition-${stack}`,
        networkMode: 'awsvpc',
        executionRoleArn: taskExecutionRole.arn,
        taskRoleArn: taskRole.arn,
        cpu,
        memory,
        requiresCompatibilities: ['FARGATE'],
        containerDefinitions: JSON.stringify(containerDefinitions),
        ...volumes.length && this.persistentStorage && {
          volumes: volumes
            .map(volume => ({
              name: volume.name,
              efsVolumeConfiguration: {
                fileSystemId: this.persistentStorage!.fileSystem.id,
                transitEncryption: 'ENABLED',
                authorizationConfig: {
                  accessPointId: this.persistentStorage!.accessPoint.id,
                  iam: 'ENABLED',
                },
              }
            }))
        },
        tags: { ...commonTags, ...tags },
      }, { parent: this })
    });
  }

  private createContainerDefinition(container: EcsService.Container) {
    return this.logGroup.name.apply(logGroupName => ({
      ...container,
      readonlyRootFilesystem: false,
      ...container.mountPoints && {
        mountPoints: container.mountPoints.map(mountPoint => pulumi.all([
          mountPoint.sourceVolume,
          mountPoint.containerPath,
          mountPoint.readOnly
        ]).apply(([sourceVolume, containerPath, readOnly]) => ({
          containerPath,
          sourceVolume,
          readOnly: readOnly ?? false,
        })))
      },
      logConfiguration: {
        logDriver: 'awslogs',
        options: {
          'awslogs-group': logGroupName,
          'awslogs-region': awsRegion,
          'awslogs-stream-prefix': 'ecs',
        },
      },
    }));
  }

  private createTaskExecutionRole(
    taskExecutionRoleInlinePolicies: InlinePolicy[]
  ): aws.iam.Role {
    const secretManagerSecretsInlinePolicy = {
      name: `${this.name}-secret-manager-access`,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowContainerToGetSecretManagerSecrets',
            Effect: 'Allow',
            Action: ['ssm:GetParameters', 'secretsmanager:GetSecretValue'],
            Resource: '*',
          },
        ],
      }),
    };

    const taskExecutionRole = new aws.iam.Role(
      `${this.name}-ecs-task-exec-role`,
      {
        namePrefix: `${this.name}-ecs-task-exec-role-`,
        assumeRolePolicy,
        managedPolicyArns: [
          'arn:aws:iam::aws:policy/CloudWatchFullAccess',
          'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess',
        ],
        inlinePolicies: [
          secretManagerSecretsInlinePolicy,
          ...taskExecutionRoleInlinePolicies,
        ],
        tags: commonTags,
      },
      { parent: this },
    );

    return taskExecutionRole;
  }

  private createTaskRole(taskRoleInlinePolicies: InlinePolicy[]): aws.iam.Role {
    const execCmdInlinePolicy = {
      name: `${this.name}-ecs-exec`,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowContainerToCreateECSExecSSMChannel',
            Effect: 'Allow',
            Action: [
              'ssmmessages:CreateControlChannel',
              'ssmmessages:CreateDataChannel',
              'ssmmessages:OpenControlChannel',
              'ssmmessages:OpenDataChannel',
            ],
            Resource: '*',
          },
        ],
      }),
    };

    return new aws.iam.Role(
      `${this.name}-ecs-task-role`,
      {
        namePrefix: `${this.name}-ecs-task-role-`,
        assumeRolePolicy,
        inlinePolicies: [
          execCmdInlinePolicy,
          ...taskRoleInlinePolicies,
        ],
        tags: commonTags,
      },
      { parent: this },
    );
  }

  public addSecurityGroup(securityGroup: pulumi.Output<aws.ec2.SecurityGroup>): void {
    this.securityGroups.push(securityGroup)
  }

  private createDefaultSecurityGroup(): void {
    const securityGroup = pulumi.all([
      this.vpc,
      this.vpc.vpcId,
      this.vpc.vpc.cidrBlock
    ]).apply(([
      vpc,
      vpcId,
      cidrBlock
    ]) => {
      return new aws.ec2.SecurityGroup(
        `${this.name}-service-security-group`,
        {
          vpcId,
          ingress: [
            {
              fromPort: 0,
              toPort: 0,
              protocol: '-1',
              cidrBlocks: [cidrBlock],
            },
          ],
          egress: [
            {
              fromPort: 0,
              toPort: 0,
              protocol: '-1',
              cidrBlocks: ['0.0.0.0/0'],
            },
          ],
          tags: commonTags,
        },
        { parent: this, dependsOn: [vpc] }
      )
    });
    this.addSecurityGroup(securityGroup);
  }

  private createEcsService(
    ecsServiceArgs: EcsService.Args,
    opts: pulumi.ComponentResourceOptions,
  ) {
    if (!this.securityGroups.length) this.createDefaultSecurityGroup();

    // TODO: can we lift this?
    const service = pulumi.all([
      this.vpc.privateSubnetIds,
      this.vpc.publicSubnetIds
    ]).apply(([
      privateSubnetIds,
      publicSubnetIds,
    ]) => {
      return new aws.ecs.Service(`${this.name}-service`, {
        name: this.name,
        cluster: ecsServiceArgs.clusterId,
        launchType: 'FARGATE',
        desiredCount: ecsServiceArgs.desiredCount,
        taskDefinition: this.taskDefinition.arn,
        enableExecuteCommand: true,
        networkConfiguration: {
          assignPublicIp: ecsServiceArgs.assignPublicIp,
          subnets: ecsServiceArgs.assignPublicIp ? publicSubnetIds : privateSubnetIds,
          // TODO: lift outputs
          securityGroups: pulumi
            .all(this.securityGroups)
            .apply(groups => groups.map(it => it.id)),
        },
        ...ecsServiceArgs.loadBalancers && { loadBalancers: ecsServiceArgs.loadBalancers },
        ...this.serviceDiscoveryService && {
          serviceRegistries: {
            registryArn: this.serviceDiscoveryService.arn,
          },
        },
        tags: { ...commonTags, ...ecsServiceArgs.tags },
      }, {
        parent: this,
        dependsOn: opts.dependsOn,
      });
    });
    return service;
  }

  private createServiceDiscovery(): aws.servicediscovery.Service {
    const privateDnsNamespace = this.createPrivateDnsNameSpace();

    return new aws.servicediscovery.Service(
      `${this.name}-service-discovery`,
      {
        name: this.name,
        dnsConfig: {
          namespaceId: privateDnsNamespace.id,
          dnsRecords: [
            {
              ttl: 10,
              type: 'A',
            },
          ],
          routingPolicy: 'MULTIVALUE',
        },
        tags: commonTags,
      },
      { parent: this },
    );
  }

  private createPrivateDnsNameSpace(): aws.servicediscovery.PrivateDnsNamespace {
    return new aws.servicediscovery.PrivateDnsNamespace(
      `${this.name}-private-dns-namespace`,
      {
        vpc: this.vpc.vpcId,
        name: this.name,
        tags: commonTags,
      },
      { parent: this },
    );
  }

  private enableAutoscaling(
    clusterName: pulumi.Output<string>,
    serviceName: pulumi.Output<string>,
    minCount: number,
    maxCount: number
  ) {
    const autoscalingTarget = new aws.appautoscaling.Target(
      `${this.name}-autoscale-target`,
      {
        minCapacity: minCount,
        maxCapacity: maxCount,
        resourceId: pulumi.interpolate`service/${clusterName}/${serviceName}`,
        serviceNamespace: 'ecs',
        scalableDimension: 'ecs:service:DesiredCount',
        tags: commonTags,
      },
      { parent: this },
    );

    const memoryAutoscalingPolicy = new aws.appautoscaling.Policy(
      `${this.name}-memory-autoscale-policy`,
      {
        policyType: 'TargetTrackingScaling',
        resourceId: autoscalingTarget.resourceId,
        scalableDimension: autoscalingTarget.scalableDimension,
        serviceNamespace: autoscalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: 'ECSServiceAverageMemoryUtilization',
          },
          targetValue: 70,
        },
      },
      { parent: this },
    );

    const cpuAutoscalingPolicy = new aws.appautoscaling.Policy(
      `${this.name}-cpu-autoscale-policy`,
      {
        policyType: 'TargetTrackingScaling',
        resourceId: autoscalingTarget.resourceId,
        scalableDimension: autoscalingTarget.scalableDimension,
        serviceNamespace: autoscalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          targetValue: 70,
        },
      },
      { parent: this },
    );
  }

  private createPersistentStorage(
    vpc: pulumi.Output<awsx.ec2.Vpc>
  ): EcsService.PersistentStorage {
    const efs = new aws.efs.FileSystem(
      `${this.name}-efs`,
      {
        encrypted: true,
        lifecyclePolicies: [
          {
            transitionToPrimaryStorageClass: 'AFTER_1_ACCESS',
          },
          {
            transitionToIa: 'AFTER_7_DAYS',
          },
        ],
        performanceMode: 'generalPurpose',
        throughputMode: 'bursting',
        tags: {
          ...commonTags,
          Name: `${this.name}-data`,
        },
      },
      { parent: this },
    );

    const securityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-persistent-storage-security-group`,
      {
        vpcId: vpc.vpcId,
        ingress: [
          {
            fromPort: 2049,
            toPort: 2049,
            protocol: 'tcp',
            cidrBlocks: [vpc.vpc.cidrBlock],
          },
        ],
        tags: commonTags,
      },
      { parent: this },
    );

    this.vpc.privateSubnetIds.apply((subnetIds) => {
      subnetIds.forEach(subnetId => {
        const mountTarget = new aws.efs.MountTarget(
          `${this.name}-mount-target-${subnetId}`,
          {
            fileSystemId: efs.id,
            subnetId,
            securityGroups: [securityGroup.id],
          },
          { parent: this },
        );
      });
    });

    const accessPoint = new aws.efs.AccessPoint(
      `${this.name}-efs-ap`,
      {
        fileSystemId: efs.id,
        posixUser: {
          uid: FIRST_POSIX_NON_ROOT_USER.userId,
          gid: FIRST_POSIX_NON_ROOT_USER.groupId,
        },
        rootDirectory: {
          path: '/data',
          creationInfo: {
            ownerUid: FIRST_POSIX_NON_ROOT_USER.userId,
            ownerGid: FIRST_POSIX_NON_ROOT_USER.groupId,
            permissions: FIRST_POSIX_NON_ROOT_USER.permissions,
          },
        },
      },
    );

    return { fileSystem: efs, accessPoint };
  }
}

function parseSize(size: Size): { cpu: string, memory: string } {
  const mapCapabilities = ({ cpu, memory }: CustomSize) => ({
    cpu: String(cpu),
    memory: String(memory),
  });
  if (typeof size === 'string') {
    return mapCapabilities(PredefinedSize[size]);
  }
  if (typeof size === 'object') {
    return mapCapabilities(size);
  }
  throw Error('Incorrect EcsService size argument');
}
