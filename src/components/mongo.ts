import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { CustomSize, Size } from '../types/size';
import { PredefinedSize, commonTags } from '../constants';
import { ContainerDefinition } from '@pulumi/aws/ecs';

const config = new pulumi.Config('aws');
const awsRegion = config.require('region');

const assumeRolePolicy: aws.iam.PolicyDocument = {
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

type RoleInlinePolicy = {
  /**
   * Name of the role policy.
   */
  name?: pulumi.Input<string>;
  /**
   * Policy document as a JSON formatted string.
   */
  policy?: pulumi.Input<string>;
};

export type MongoArgs = {
  /**
   * The ECR image used to start a container.
   */
  image: pulumi.Input<string>;
  /**
   * Exposed service port.
   */
  port: pulumi.Input<number>;
  /**
   * The aws.ecs.Cluster resource.
   */
  cluster: aws.ecs.Cluster;
  /**
   * The awsx.ec2.Vpc resource.
   */
  vpc: awsx.ec2.Vpc;
  /**
   * Number of instances of the task definition to place and keep running. Defaults to 1.
   */
  desiredCount?: pulumi.Input<number>;
  /**
   * Min capacity of the scalable target. Defaults to 1.
   */
  minCount?: pulumi.Input<number>;
  /**
   * Max capacity of the scalable target. Defaults to 10.
   */
  maxCount?: pulumi.Input<number>;
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
  environment?: aws.ecs.KeyValuePair[];
  /**
   * The secrets to pass to the container. Defaults to [].
   */
  secrets?: aws.ecs.Secret[];
  /**
   * Path for the health check request. Defaults to "/healtcheck".
   */
  healtCheckPath?: pulumi.Input<string>;
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
  minCount: 1,
  maxCount: 10,
  size: 'small',
  environment: [],
  secrets: [],
  healtCheckPath: '/healtcheck',
  taskExecutionRoleInlinePolicies: [],
  taskRoleInlinePolicies: [],
};

export class Mongo extends pulumi.ComponentResource {
  name: string;
  logGroup: aws.cloudwatch.LogGroup;
  taskDefinition: aws.ecs.TaskDefinition;
  serviceSecurityGroup: aws.ec2.SecurityGroup;
  mountTarget: aws.efs.MountTarget;
  service: aws.ecs.Service;

  constructor(
    name: string,
    args: MongoArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Mongo', name, {}, opts);

    this.name = name;
    this.logGroup = this.createLogGroup();

    this.serviceSecurityGroup = this.createSecurityGroup(args);
    this.mountTarget = this.createMountTarget(args);
    this.taskDefinition = this.createTaskDefinition(args);
    this.service = this.createEcsService(args);

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

  private createSecurityGroup(args: MongoArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);
    return new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId: argsWithDefaults.vpc.vpcId,
        ingress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: '-1',
            cidrBlocks: ['0.0.0.0/0'],
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
  }

  private createMountTarget(args: MongoArgs) {
    const efs = new aws.efs.FileSystem(`${this.name}-efs`, {
      tags: {
        Name: `${this.name}-data`,
      },
    });

    return new aws.efs.MountTarget(`${this.name}-mount-target`, {
      fileSystemId: efs.id,
      subnetId: args.vpc.publicSubnetIds[0],
      securityGroups: [this.serviceSecurityGroup.id],
    });
  }

  private createTaskDefinition(args: MongoArgs) {
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
            Action: ['secretsmanager:GetSecretValue'],
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
                  mountPoints: [
                    {
                      containerPath: '/data/db',
                      sourceVolume: `${this.name}-volume`,
                    },
                  ],
                  logConfiguration: {
                    logDriver: 'awslogs',
                    options: {
                      'awslogs-group': logGroup,
                      'awslogs-region': region,
                      'awslogs-stream-prefix': 'ecs',
                    },
                  },
                  environment,
                  secrets,
                },
              ] as ContainerDefinition[]);
            },
          ),
        volumes: [
          {
            name: `${this.name}-volume`,
            efsVolumeConfiguration: {
              fileSystemId: this.mountTarget.fileSystemId,
              transitEncryption: 'ENABLED',
            },
          },
        ],
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this },
    );

    return taskDefinition;
  }

  private createEcsService(args: MongoArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);

    const service = new aws.ecs.Service(
      `${this.name}-service`,
      {
        name: this.name,
        cluster: argsWithDefaults.cluster.id,
        launchType: 'FARGATE',
        desiredCount: argsWithDefaults.desiredCount,
        taskDefinition: this.taskDefinition.arn,
        enableExecuteCommand: true,
        networkConfiguration: {
          assignPublicIp: true,
          subnets: argsWithDefaults.vpc.publicSubnetIds,
          securityGroups: [this.serviceSecurityGroup.id],
        },
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      {
        parent: this,
        dependsOn: [],
      },
    );
    return service;
  }
}
