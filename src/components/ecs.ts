import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { CustomSize, Size } from './types';
import { PredefinedSize } from '../constants';
import { ContainerDefinition } from '@pulumi/aws/ecs';
const config = new pulumi.Config('aws');
const awsRegion = config.get('region');

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
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  cluster: aws.ecs.Cluster;
  subnets: pulumi.Input<pulumi.Input<string>[]>;
  securityGroupIds: pulumi.Input<pulumi.Input<string>[]>;
  lb: aws.lb.LoadBalancer;
  lbTargetGroup: aws.lb.TargetGroup;
  lbListener: aws.lb.Listener;
  desiredCount?: pulumi.Input<number>;
  minCount?: pulumi.Input<number>;
  maxCount?: pulumi.Input<number>;
  size?: pulumi.Input<Size>;
  environment?: aws.ecs.KeyValuePair[];
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
};

export class EcsService extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: EcsServiceArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:ecs:Service', name, {}, opts);

    const logGroup = new aws.cloudwatch.LogGroup(
      `${name}-log-group`,
      {
        retentionInDays: 14,
        name: `/ecs/${name}`,
      },
      { parent: this },
    );

    const taskExecutionRole = new aws.iam.Role(
      `${name}-ecs-task-exec-role`,
      {
        name: `${name}-ecs-task-exec-role`,
        assumeRolePolicy,
        managedPolicyArns: [
          'arn:aws:iam::aws:policy/CloudWatchFullAccess',
          'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess',
        ],
        inlinePolicies: args.taskExecutionRoleInlinePolicies || [],
      },
      { parent: this },
    );

    const taskRole = new aws.iam.Role(
      `${name}-ecs-task-role`,
      {
        name: `${name}-ecs-task-role`,
        assumeRolePolicy,
        inlinePolicies: args.taskRoleInlinePolicies || [],
      },
      { parent: this },
    );

    const parsedSize = pulumi.all([args.size || 'small']).apply(([size]) => {
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
      `${name}-task-definition`,
      {
        family: `${name}-task-definition`,
        networkMode: 'awsvpc',
        executionRoleArn: taskExecutionRole.arn,
        taskRoleArn: taskRole.arn,
        cpu: parsedSize.cpu,
        memory: parsedSize.memory,
        requiresCompatibilities: ['FARGATE'],
        containerDefinitions: pulumi
          .all([
            name,
            args.image,
            args.port,
            args.environment || [],
            logGroup.name,
            awsRegion,
          ])
          .apply(
            ([containerName, image, port, environment, logGroup, region]) => {
              return JSON.stringify([
                {
                  name: containerName,
                  image,
                  essential: true,
                  portMappings: [
                    {
                      containerPort: port,
                      protocol: 'tcp',
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
                },
              ] as ContainerDefinition[]);
            },
          ),
      },
      { parent: this },
    );

    const service = new aws.ecs.Service(
      `${name}-service`,
      {
        name,
        cluster: args.cluster.id,
        launchType: 'FARGATE',
        desiredCount: args.desiredCount || 1,
        taskDefinition: taskDefinition.arn,
        loadBalancers: [
          {
            containerName: name,
            containerPort: args.port,
            targetGroupArn: args.lbTargetGroup.arn,
          },
        ],
        networkConfiguration: {
          assignPublicIp: true,
          subnets: args.subnets,
          securityGroups: args.securityGroupIds,
        },
      },
      {
        parent: this,
        dependsOn: [args.lb, args.lbTargetGroup, args.lbListener],
      },
    );

    const autoscalingTarget = new aws.appautoscaling.Target(
      `${name}-autoscale-target`,
      {
        minCapacity: args.minCount || 1,
        maxCapacity: args.maxCount || 10,
        resourceId: pulumi.interpolate`service/${args.cluster.name}/${service.name}`,
        serviceNamespace: 'ecs',
        scalableDimension: 'ecs:service:DesiredCount',
      },
      { parent: this },
    );

    const memoryAutoscalingPolicy = new aws.appautoscaling.Policy(
      `${name}-memory-autoscale-policy`,
      {
        policyType: 'TargetTrackingScaling',
        resourceId: autoscalingTarget.resourceId,
        scalableDimension: autoscalingTarget.scalableDimension,
        serviceNamespace: autoscalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: 'ECSServiceAverageMemoryUtilization',
          },
          targetValue: 80,
        },
      },
      { parent: this },
    );

    const cpuAutoscalingPolicy = new aws.appautoscaling.Policy(
      `${name}-cpu-autoscale-policy`,
      {
        policyType: 'TargetTrackingScaling',
        resourceId: autoscalingTarget.resourceId,
        scalableDimension: autoscalingTarget.scalableDimension,
        serviceNamespace: autoscalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          targetValue: 60,
        },
      },
      { parent: this },
    );

    this.registerOutputs();
  }
}
