import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { CustomSize, Size } from '../types/size';
import { PredefinedSize, commonTags } from '../constants';
import { ContainerDefinition } from '@pulumi/aws/ecs';

const config = new pulumi.Config('aws');
export const awsRegion = config.require('region');

export const assumeRolePolicy: aws.iam.PolicyDocument = {
  Version: '2012-10-17',
  Statement: [
    {
      Action: 'sts:AssumeRole',
      Principal: {
        Service: 'ecs-tasks.amazonaws.com',
      },
      Effect: 'Allow',
      Sid: '',
    },
  ],
};

export type RoleInlinePolicy = {
  /**
   * Name of the role policy.
   */
  name?: pulumi.Input<string>;
  /**
   * Policy document as a JSON formatted string.
   */
  policy?: pulumi.Input<string>;
};

export type EcsServiceArgs = {
  /**
   * The ECR image used to start a container.
   */
  image: pulumi.Input<string>;
  /**
   * Exposed service port.
   */
  port: pulumi.Input<number>;
  /**
   * The aws.ecs.Cluster id.
   */
  clusterId: pulumi.Input<string>;
  /**
   * The aws.ecs.Cluster name.
   */
  clusterName: pulumi.Input<string>;
  vpcId: pulumi.Input<string>;
  /**
   * The IPv4 CIDR block for the VPC.
   */
  vpcCidrBlock: pulumi.Input<string>;
  /**
   * If the `assignPublicIp` parameter is set to `true`, the publicSubnetIds
   * must be provided; otherwise, provide the privateSubnetIds.
   */
  subnetIds: pulumi.Input<pulumi.Input<string>[]>;
  /**
   * Number of instances of the task definition to place and keep running. Defaults to 1.
   */
  desiredCount?: pulumi.Input<number>;
  /**
   * CPU and memory size used for running the container. Defaults to "small".
   * Available predefined options are:
   * - small (0.25 vCPU, 0.5 GB memory)
   * - medium (0.5 vCPU, 1 GB memory)
   * - large (1 vCPU memory, 2 GB memory)
   * - xlarge (2 vCPU, 4 GB memory)
   */
  size?: pulumi.Input<Size>;

  /**
   * The environment variables to pass to a container. Don't use this field for
   * sensitive information such as passwords, API keys, etc. For that purpose,
   * please use the `secrets` property.
   * Defaults to [].
   */
  environment?: pulumi.Input<aws.ecs.KeyValuePair[]>;
  /**
   * The secrets to pass to the container. Defaults to [].
   */
  secrets?: pulumi.Input<aws.ecs.Secret[]>;
  /**
   * Enable service auto discovery and assign DNS record to service.
   * Defaults to false.
   */
  enableServiceAutoDiscovery: pulumi.Input<boolean>;
  /**
   * Location of persistent storage volume.
   */
  persistentStorageVolumePath?: pulumi.Input<string>;
  /**
   * Alternate docker CMD instruction.
   */
  dockerCommand?: pulumi.Input<string[]>;
  /**
   * Autoscaling options for ecs service.
   */
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
  lbTargetGroupArn?: aws.lb.TargetGroup['arn'];
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
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
  /**
   * A map of tags to assign to the resource.
   */
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

const defaults = {
  desiredCount: 1,
  size: 'small',
  environment: [],
  secrets: [],
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
  logGroup: aws.cloudwatch.LogGroup;
  taskDefinition: aws.ecs.TaskDefinition;
  serviceDiscoveryService?: aws.servicediscovery.Service;
  service: aws.ecs.Service;

  constructor(
    name: string,
    args: EcsServiceArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:ecs:Service', name, {}, opts);
    const argsWithDefaults = Object.assign({}, defaults, args);

    this.name = name;
    this.logGroup = this.createLogGroup();
    this.taskDefinition = this.createTaskDefinition(args);
    if (argsWithDefaults.enableServiceAutoDiscovery) {
      this.serviceDiscoveryService = this.createServiceDiscovery(
        argsWithDefaults.vpcId,
      );
    }
    this.service = this.createEcsService(args, opts);
    if (argsWithDefaults.autoscaling.enabled) {
      this.enableAutoscaling(args);
    }

    this.registerOutputs();
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

  private createPersistentStorage({
    vpcId,
    vpcCidrBlock,
    subnetIds,
  }: Pick<EcsServiceArgs, 'vpcId' | 'vpcCidrBlock' | 'subnetIds'>) {
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
        vpcId: vpcId,
        ingress: [
          {
            fromPort: 2049,
            toPort: 2049,
            protocol: 'tcp',
            cidrBlocks: [vpcCidrBlock],
          },
        ],
        tags: commonTags,
      },
      { parent: this },
    );

    pulumi.all([subnetIds]).apply(([ids]) => {
      ids.forEach(it => {
        const mountTarget = new aws.efs.MountTarget(
          `${this.name}-mount-target-${it}`,
          {
            fileSystemId: efs.id,
            subnetId: it,
            securityGroups: [securityGroup.id],
          },
          { parent: this },
        );
      });
    });

    return efs;
  }

  private createTaskDefinition(args: EcsServiceArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);
    const stack = pulumi.getStack();

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
          ...argsWithDefaults.taskExecutionRoleInlinePolicies,
        ],
        tags: commonTags,
      },
      { parent: this },
    );

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

    const taskRole = new aws.iam.Role(
      `${this.name}-ecs-task-role`,
      {
        namePrefix: `${this.name}-ecs-task-role-`,
        assumeRolePolicy,
        inlinePolicies: [
          execCmdInlinePolicy,
          ...argsWithDefaults.taskRoleInlinePolicies,
        ],
        tags: commonTags,
      },
      { parent: this },
    );

    const parsedSize = pulumi.all([argsWithDefaults.size]).apply(([size]) => {
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
    });

    const taskDefinition = new aws.ecs.TaskDefinition(
      `${this.name}-task-definition`,
      {
        family: `${this.name}-task-definition-${stack}`,
        networkMode: 'awsvpc',
        executionRoleArn: taskExecutionRole.arn,
        taskRoleArn: taskRole.arn,
        cpu: parsedSize.cpu,
        memory: parsedSize.memory,
        requiresCompatibilities: ['FARGATE'],
        containerDefinitions: pulumi
          .all([
            this.name,
            argsWithDefaults.image,
            argsWithDefaults.port,
            argsWithDefaults.environment,
            argsWithDefaults.secrets,
            argsWithDefaults.persistentStorageVolumePath,
            argsWithDefaults.dockerCommand,
            this.logGroup.name,
            awsRegion,
          ])
          .apply(
            ([
              containerName,
              image,
              port,
              environment,
              secrets,
              persistentStorageVolumePath,
              command,
              logGroup,
              region,
            ]) => {
              return JSON.stringify([
                {
                  readonlyRootFilesystem: false,
                  name: containerName,
                  image,
                  essential: true,
                  portMappings: [
                    {
                      containerPort: port,
                      protocol: 'tcp',
                    },
                  ],
                  ...(persistentStorageVolumePath && {
                    mountPoints: [
                      {
                        containerPath: persistentStorageVolumePath,
                        sourceVolume: `${this.name}-volume`,
                      },
                    ],
                  }),
                  logConfiguration: {
                    logDriver: 'awslogs',
                    options: {
                      'awslogs-group': logGroup,
                      'awslogs-region': region,
                      'awslogs-stream-prefix': 'ecs',
                    },
                  },
                  command,
                  environment,
                  secrets,
                },
              ] as ContainerDefinition[]);
            },
          ),
        ...(argsWithDefaults.persistentStorageVolumePath && {
          volumes: [
            {
              name: `${this.name}-volume`,
              efsVolumeConfiguration: {
                fileSystemId: this.createPersistentStorage(argsWithDefaults).id,
                transitEncryption: 'ENABLED',
              },
            },
          ],
        }),
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this },
    );

    return taskDefinition;
  }

  private createServiceDiscovery(vpcId: EcsServiceArgs['vpcId']) {
    const privateDnsNamespace = new aws.servicediscovery.PrivateDnsNamespace(
      `${this.name}-private-dns-namespace`,
      {
        vpc: vpcId,
        name: this.name,
        tags: commonTags,
      },
      { parent: this },
    );

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

  private createEcsService(
    args: EcsServiceArgs,
    opts: pulumi.ComponentResourceOptions,
  ) {
    const argsWithDefaults = Object.assign({}, defaults, args);

    const securityGroup =
      argsWithDefaults.securityGroup ||
      new aws.ec2.SecurityGroup(
        `${this.name}-service-security-group`,
        {
          vpcId: argsWithDefaults.vpcId,
          ingress: [
            {
              fromPort: 0,
              toPort: 0,
              protocol: '-1',
              cidrBlocks: [argsWithDefaults.vpcCidrBlock],
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
        { parent: this },
      );

    const service = new aws.ecs.Service(
      `${this.name}-service`,
      {
        name: this.name,
        cluster: argsWithDefaults.clusterId,
        launchType: 'FARGATE',
        desiredCount: argsWithDefaults.desiredCount,
        taskDefinition: this.taskDefinition.arn,
        enableExecuteCommand: true,
        ...(argsWithDefaults.lbTargetGroupArn && {
          loadBalancers: [
            {
              containerName: this.name,
              containerPort: argsWithDefaults.port,
              targetGroupArn: argsWithDefaults.lbTargetGroupArn,
            },
          ],
        }),
        networkConfiguration: {
          assignPublicIp: argsWithDefaults.assignPublicIp,
          subnets: argsWithDefaults.subnetIds,
          securityGroups: [securityGroup.id],
        },
        ...(argsWithDefaults.enableServiceAutoDiscovery &&
          this.serviceDiscoveryService && {
            serviceRegistries: {
              registryArn: this.serviceDiscoveryService.arn,
            },
          }),
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      {
        parent: this,
        dependsOn: opts.dependsOn,
      },
    );
    return service;
  }

  private enableAutoscaling(args: EcsServiceArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);

    const autoscalingTarget = new aws.appautoscaling.Target(
      `${this.name}-autoscale-target`,
      {
        minCapacity: argsWithDefaults.autoscaling.minCount,
        maxCapacity: argsWithDefaults.autoscaling.maxCount,
        resourceId: pulumi.interpolate`service/${argsWithDefaults.clusterName}/${this.service.name}`,
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
}
