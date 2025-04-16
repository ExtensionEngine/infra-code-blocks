import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { CustomSize, Size } from '../../../types/size';
import { PredefinedSize, commonTags } from '../../../constants';
import { assumeRolePolicy } from './policies';

const config = new pulumi.Config('aws');
const awsRegion = config.require('region');

type PersistentStorage = {
  fileSystem: aws.efs.FileSystem,
  accessPoint: aws.efs.AccessPoint
};

export namespace EcsService {
  /**
   * Create a named volume that can be mounted into one or more containers.
   * Used with Amazon EFS to enable persistent storage across:
   * - Container restarts
   * - Multiple containers
   */
  export type PersistentStorageVolume = { name: pulumi.Input<string>; };

  /**
   * Specifies how an EFS volume is mounted into a container.
   * `sourceVolume`: Name of the defined ECS service volume.
   * `containerPath`: Path into which the volume is mounted in the container.
   *
   * @see {@link PersistentStorageVolume} - Required to define volumes before mounting
   * @see {@link Container} - Where `mountPoints` are specified
   */
  export type PersistentStorageMountPoint = {
    sourceVolume: pulumi.Input<string>;
    containerPath: pulumi.Input<string>;
    readOnly?: pulumi.Input<boolean>;
  };

  /**
   * Container configuration for the ECS task definition.
   * Multiple containers can be defined to create multi-container tasks.
   */
  export type Container = {
    name: pulumi.Input<string>;
    image: pulumi.Input<string>;
    portMappings?: pulumi.Input<pulumi.Input<aws.ecs.PortMapping>[]>;
    command?: pulumi.Input<pulumi.Input<string>[]>;
    mountPoints?: PersistentStorageMountPoint[];
    environment?: pulumi.Input<aws.ecs.KeyValuePair[]>;
    secrets?: pulumi.Input<aws.ecs.Secret[]>;
    dependsOn?: pulumi.Input<aws.ecs.ContainerDependency[]>;
    /**
     * If `false`, task can continue running if this container fails.
     * Should be `false` for containers that execute and then tear down.
     *
     * Examples: Database migration, or configuration containers
     *
     * All containers not marked as `false` will be essential by default.
     */
    essential?: pulumi.Input<boolean>;
    healthCheck?: pulumi.Input<aws.ecs.HealthCheck>
  };

  export type Tags = { [key: string]: pulumi.Input<string>; };

  export type LoadBalancerConfig = {
    containerName: pulumi.Input<string>;
    containerPort: pulumi.Input<number>;
    targetGroupArn: aws.lb.TargetGroup['arn'];
  };

  export type RoleInlinePolicy = aws.types.input.iam.RoleInlinePolicy;

  export type Args = {
    cluster: pulumi.Input<aws.ecs.Cluster>;
    vpc: pulumi.Input<awsx.ec2.Vpc>;
    containers: EcsService.Container[];
    loadBalancers?: pulumi.Input<LoadBalancerConfig[]>;
    volumes?: pulumi.Input<pulumi.Input<EcsService.PersistentStorageVolume>[]>;
    /**
     * Number of instances of the task definition to place and keep running.
     * @default 1
     */
    desiredCount?: pulumi.Input<number>;
    /**
     * CPU and memory size used for running the container.
     * Available predefined options are:
     * - `small` (0.25 vCPU, 0.5 GB memory)
     * - `medium` (0.5 vCPU, 1 GB memory)
     * - `large` (1 vCPU memory, 2 GB memory)
     * - `xlarge` (2 vCPU, 4 GB memory)
     *
     * @default "small"
     */
    size?: pulumi.Input<Size>;
    /**
     * Custom service security group
     * In case no security group is provided, default security group will be automatically created.
     */
    securityGroup?: pulumi.Input<aws.ec2.SecurityGroup>;
    assignPublicIp?: pulumi.Input<boolean>;
    taskExecutionRoleInlinePolicies?: pulumi.Input<
      pulumi.Input<RoleInlinePolicy>[]
    >;
    taskRoleInlinePolicies?: pulumi.Input<
      pulumi.Input<RoleInlinePolicy>[]
    >;
    /**
     * Registers tasks with AWS Cloud Map and creates discoverable DNS entries for each task.
     * Simplifies service-to-service communication by enabling service finding based on DNS records such as `http://serviceName.local`.
     *
     * @default false
     */
    enableServiceAutoDiscovery?: pulumi.Input<boolean>;
    autoscaling?: pulumi.Input<{
      /**
       * Is autoscaling enabled or disabled.
       *
       * @default false
       */
      enabled: pulumi.Input<boolean>;
      /**
       * Min capacity of the scalable target.
       *
       * @default 1
       */
      minCount?: pulumi.Input<number>;
      /**
       * Max capacity of the scalable target.
       *
       * @default 1
       */
      maxCount?: pulumi.Input<number>;
    }>;
    /**
     * A map of tags to assign to the resource.
     */
    tags?: pulumi.Input<EcsService.Tags>;
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
  service: aws.ecs.Service;
  securityGroups: pulumi.Output<aws.ec2.SecurityGroup>[];
  serviceDiscoveryService?: aws.servicediscovery.Service;
  persistentStorage?: PersistentStorage;

  constructor(
    name: string,
    args: EcsService.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:ecs:Service', name, {}, opts);
    const argsWithDefaults = Object.assign({}, defaults, args);
    const taskExecutionRoleInlinePolicies = pulumi.output(
      args.taskExecutionRoleInlinePolicies || defaults.taskExecutionRoleInlinePolicies
    );
    const taskRoleInlinePolicies = pulumi.output(
      args.taskRoleInlinePolicies || defaults.taskRoleInlinePolicies
    );
    this.name = name;
    this.securityGroups = [];
    this.vpc = pulumi.output(argsWithDefaults.vpc);
    this.logGroup = this.createLogGroup();
    this.taskExecutionRole = this.createTaskExecutionRole(taskExecutionRoleInlinePolicies);
    this.taskRole = this.createTaskRole(taskRoleInlinePolicies)

    if (argsWithDefaults.volumes.length) {
      this.persistentStorage = this.createPersistentStorage(this.vpc);
    }

    this.taskDefinition = this.createTaskDefinition(
      argsWithDefaults.containers,
      pulumi.output(argsWithDefaults.volumes),
      this.taskExecutionRole,
      this.taskRole,
      argsWithDefaults.size,
      { ...commonTags, ...argsWithDefaults.tags }
    );

    if (argsWithDefaults.enableServiceAutoDiscovery) {
      this.serviceDiscoveryService = this.createServiceDiscovery();
    }

    this.service = this.createEcsService(argsWithDefaults);

    if (argsWithDefaults.autoscaling.enabled) {
      this.enableAutoscaling(
        pulumi.output(argsWithDefaults.cluster).name,
        this.service.name,
        argsWithDefaults.autoscaling.minCount,
        argsWithDefaults.autoscaling.maxCount,
      );
    }

    this.registerOutputs();
  }

  public static createTcpPortMapping(
    port: pulumi.Input<number>
  ): aws.ecs.PortMapping {
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
    volumes: pulumi.Output<EcsService.PersistentStorageVolume[]>,
    taskExecutionRole: aws.iam.Role,
    taskRole: aws.iam.Role,
    size: pulumi.Input<Size>,
    tags: pulumi.Input<EcsService.Tags>
  ): pulumi.Output<aws.ecs.TaskDefinition> {
    const stack = pulumi.getStack();
    const { cpu, memory } = pulumi.output(size).apply(parseSize);
    const containerDefinitions = containers.map(container => {
      return this.createContainerDefinition(container)
    });

    const taskDefinitionVolumes = this.createTaskDefinitionVolumes(volumes);

    return pulumi.all(containerDefinitions).apply(containerDefinitions => {
      return taskDefinitionVolumes.apply(volumes => {
        return new aws.ecs.TaskDefinition(`${this.name}-task-definition`, {
          family: `${this.name}-task-definition-${stack}`,
          networkMode: 'awsvpc',
          executionRoleArn: taskExecutionRole.arn,
          taskRoleArn: taskRole.arn,
          cpu,
          memory,
          requiresCompatibilities: ['FARGATE'],
          containerDefinitions: JSON.stringify(containerDefinitions),
          ...(volumes?.length ? { volumes } : {}),
          tags: { ...commonTags, ...tags },
        }, { parent: this })
      });
    });
  }

  private createTaskDefinitionVolumes(
    volumes: pulumi.Output<EcsService.PersistentStorageVolume[]>
  ) {
    return volumes.apply(volumes => {
      if (!volumes.length || !this.persistentStorage) return;

      return volumes.map(volume => ({
        name: pulumi.output(volume).name,
        efsVolumeConfiguration: {
          fileSystemId: this.persistentStorage!.fileSystem.id,
          transitEncryption: 'ENABLED',
          authorizationConfig: {
            accessPointId: this.persistentStorage!.accessPoint.id,
            iam: 'ENABLED',
          },
        }
      }));
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
    inlinePolicies: pulumi.Output<EcsService.RoleInlinePolicy[]>
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
      `${this.name}-task-exec-role`,
      {
        namePrefix: `${this.name}-task-exec-role-`,
        assumeRolePolicy,
        managedPolicyArns: [
          'arn:aws:iam::aws:policy/CloudWatchFullAccess',
          'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess',
        ],
        inlinePolicies: inlinePolicies.apply(policies => [
          secretManagerSecretsInlinePolicy,
          ...policies,
        ]),
        tags: commonTags,
      },
      { parent: this },
    );

    return taskExecutionRole;
  }

  private createTaskRole(
    inlinePolicies: pulumi.Output<EcsService.RoleInlinePolicy[]>
  ): aws.iam.Role {
    const execCmdInlinePolicy = {
      name: `${this.name}-exec`,
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

    return new aws.iam.Role(`${this.name}-task-role`, {
      namePrefix: `${this.name}-task-role-`,
      assumeRolePolicy,
      inlinePolicies: inlinePolicies.apply(policies => [
        execCmdInlinePolicy,
        ...policies,
      ]),
      tags: commonTags,
    }, { parent: this });
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

  private createEcsService(ecsServiceArgs: EcsService.Args) {
    if (!this.securityGroups.length) this.createDefaultSecurityGroup();

    const networkConfiguration = {
      assignPublicIp: ecsServiceArgs.assignPublicIp,
      subnets: ecsServiceArgs.assignPublicIp ? this.vpc.publicSubnetIds : this.vpc.privateSubnetIds,
      securityGroups: pulumi
        .all(this.securityGroups)
        .apply(groups => groups.map(it => it.id)),
    }

    return new aws.ecs.Service(`${this.name}-service`, {
      name: this.name,
      cluster: pulumi.output(ecsServiceArgs.cluster).id,
      launchType: 'FARGATE',
      desiredCount: ecsServiceArgs.desiredCount,
      taskDefinition: this.taskDefinition.arn,
      enableExecuteCommand: true,
      networkConfiguration,
      ...ecsServiceArgs.loadBalancers && { loadBalancers: ecsServiceArgs.loadBalancers },
      ...this.serviceDiscoveryService && {
        serviceRegistries: {
          registryArn: this.serviceDiscoveryService.arn,
        },
      },
      tags: { ...commonTags, ...ecsServiceArgs.tags },
    }, { parent: this, });
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
  ): PersistentStorage {
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
