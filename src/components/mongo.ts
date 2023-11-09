import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { CustomSize } from '../types/size';
import { PredefinedSize, commonTags } from '../constants';
import { ContainerDefinition } from '@pulumi/aws/ecs';
import { Ecs, EcsArgs, assumeRolePolicy, awsRegion } from './ecs';

const defaults = {
  size: 'small',
  environment: [],
  secrets: [],
  taskExecutionRoleInlinePolicies: [],
  taskRoleInlinePolicies: [],
};

export class Mongo extends Ecs {
  taskDefinition: aws.ecs.TaskDefinition;
  serviceSecurityGroup: aws.ec2.SecurityGroup;
  persistentStorage: aws.efs.MountTarget;
  serviceDiscovery: aws.servicediscovery.Service;
  service: aws.ecs.Service;

  constructor(
    name: string,
    args: EcsArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Mongo', name, args, opts);

    this.serviceSecurityGroup = this.createSecurityGroup(args);
    this.persistentStorage = this.createPersistentStorage(args);
    this.taskDefinition = this.createTaskDefinition(args);
    this.serviceDiscovery = this.createServiceDiscovery(args);
    this.service = this.createEcsService(args);

    this.registerOutputs();
  }

  private createSecurityGroup(args: EcsArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);
    return new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId: argsWithDefaults.vpc.vpcId,
        ingress: [
          {
            fromPort: argsWithDefaults.port,
            toPort: argsWithDefaults.port,
            protocol: 'tcp',
            cidrBlocks: [argsWithDefaults.vpc.vpc.cidrBlock],
          },
          {
            fromPort: 2049,
            toPort: 2049,
            protocol: 'tcp',
            cidrBlocks: [argsWithDefaults.vpc.vpc.cidrBlock],
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

  private createPersistentStorage(args: EcsArgs) {
    const key = new aws.kms.Key(`${this.name}-kms-key`, {
      deletionWindowInDays: 10,
    });

    const efs = new aws.efs.FileSystem(`${this.name}-efs`, {
      encrypted: true,
      kmsKeyId: key.arn,
      lifecyclePolicies: [
        {
          transitionToPrimaryStorageClass: 'AFTER_1_ACCESS',
        },
      ],
      tags: {
        Name: `${this.name}-data`,
      },
    });

    return new aws.efs.MountTarget(`${this.name}-mount-target`, {
      fileSystemId: efs.id,
      subnetId: args.vpc.privateSubnetIds[0],
      securityGroups: [this.serviceSecurityGroup.id],
    });
  }

  private createTaskDefinition(args: EcsArgs) {
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
                  command: ['mongod', '--port', port.toString()],
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
              fileSystemId: this.persistentStorage.fileSystemId,
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

  private createServiceDiscovery(args: EcsArgs) {
    const privateDnsNamespace = new aws.servicediscovery.PrivateDnsNamespace(
      `${this.name}-private-dns-namespace`,
      {
        vpc: args.vpc.vpcId,
        name: this.name,
      },
    );

    return new aws.servicediscovery.Service(`mongo-service`, {
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
      healthCheckCustomConfig: {
        failureThreshold: 1,
      },
    });
  }

  private createEcsService(args: EcsArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);

    const service = new aws.ecs.Service(
      `${this.name}-service`,
      {
        name: this.name,
        cluster: argsWithDefaults.cluster.id,
        launchType: 'FARGATE',
        desiredCount: 1,
        taskDefinition: this.taskDefinition.arn,
        networkConfiguration: {
          subnets: [argsWithDefaults.vpc.privateSubnetIds[0]],
          securityGroups: [this.serviceSecurityGroup.id],
        },
        serviceRegistries: {
          registryArn: this.serviceDiscovery.arn,
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
