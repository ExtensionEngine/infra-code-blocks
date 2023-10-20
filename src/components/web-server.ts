import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { CustomSize, Size } from '../types/size';
import { PredefinedSize } from '../constants';
import { ContainerDefinition } from '@pulumi/aws/ecs';
import { AcmCertificate } from './acm-certificate';

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

export type WebServerArgs = {
  /**
   * The ECR image used to start a container.
   */
  image: pulumi.Input<string>;
  /**
   * Exposed service port.
   */
  port: pulumi.Input<number>;
  /**
   * The domain which will be used to access the service.
   * The domain or subdomain must belong to the provided hostedZone.
   */
  domain: pulumi.Input<string>;
  /**
   * The aws.ecs.Cluster resource.
   */
  cluster: aws.ecs.Cluster;
  /**
   * The ID of the hosted zone.
   */
  hostedZoneId: pulumi.Input<string>;
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

export class WebServer extends pulumi.ComponentResource {
  certificate: AcmCertificate;
  logGroup: aws.cloudwatch.LogGroup;
  lbSecurityGroup: aws.ec2.SecurityGroup;
  lb: aws.lb.LoadBalancer;
  lbTargetGroup: aws.lb.TargetGroup;
  lbHttpListener: aws.lb.Listener;
  lbTlsListener: aws.lb.Listener;
  serviceSecurityGroup: aws.ec2.SecurityGroup;
  taskDefinition: aws.ecs.TaskDefinition;
  service: aws.ecs.Service;

  constructor(
    name: string,
    args: WebServerArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:WebServer', name, {}, opts);

    const argsWithDefaults = Object.assign({}, defaults, args);

    this.certificate = new AcmCertificate(
      `${argsWithDefaults.domain}-acm-certificate`,
      {
        domain: argsWithDefaults.domain,
        hostedZoneId: argsWithDefaults.hostedZoneId,
      },
      { parent: this },
    );

    this.logGroup = new aws.cloudwatch.LogGroup(
      `${name}-log-group`,
      {
        retentionInDays: 14,
        name: `/ecs/${name}`,
      },
      { parent: this },
    );

    this.lbSecurityGroup = new aws.ec2.SecurityGroup(
      `${name}-lb-security-group`,
      {
        vpcId: argsWithDefaults.vpc.vpcId,
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ['0.0.0.0/0'],
          },
          {
            protocol: 'tcp',
            fromPort: 443,
            toPort: 443,
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
      },
      { parent: this },
    );

    this.lb = new aws.lb.LoadBalancer(
      `${name}-lb`,
      {
        name: `${name}-lb`,
        loadBalancerType: 'application',
        subnets: argsWithDefaults.vpc.publicSubnetIds,
        securityGroups: [this.lbSecurityGroup.id],
        internal: false,
        ipAddressType: 'ipv4',
      },
      { parent: this },
    );

    this.lbTargetGroup = new aws.lb.TargetGroup(
      `${name}-lb-tg`,
      {
        name: `${name}-lb-tg`,
        port: argsWithDefaults.port,
        protocol: 'HTTP',
        targetType: 'ip',
        vpcId: argsWithDefaults.vpc.vpcId,
        healthCheck: {
          healthyThreshold: 3,
          unhealthyThreshold: 2,
          interval: 60,
          timeout: 5,
          path: argsWithDefaults.healtCheckPath,
        },
      },
      { parent: this, dependsOn: [this.lb] },
    );

    this.lbHttpListener = new aws.lb.Listener(
      `${name}-lb-listener-80`,
      {
        loadBalancerArn: this.lb.arn,
        port: 80,
        defaultActions: [
          {
            type: 'redirect',
            redirect: {
              port: '443',
              protocol: 'HTTPS',
              statusCode: 'HTTP_301',
            },
          },
        ],
      },
      { parent: this },
    );

    this.lbTlsListener = new aws.lb.Listener(
      `${name}-lb-listener-443`,
      {
        loadBalancerArn: this.lb.arn,
        port: 443,
        protocol: 'HTTPS',
        sslPolicy: 'ELBSecurityPolicy-2016-08',
        certificateArn: this.certificate.certificate.arn,
        defaultActions: [
          {
            type: 'forward',
            targetGroupArn: this.lbTargetGroup.arn,
          },
        ],
      },
      { parent: this },
    );

    const albAliasRecord = new aws.route53.Record(
      `${name}-route53-record`,
      {
        type: 'A',
        name: argsWithDefaults.domain,
        zoneId: argsWithDefaults.hostedZoneId,
        aliases: [
          {
            name: this.lb.dnsName,
            zoneId: this.lb.zoneId,
            evaluateTargetHealth: true,
          },
        ],
      },
      { parent: this },
    );

    const secretManagerSecretsInlinePolicy = {
      name: `${name}-secret-manager-access`,
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
      `${name}-ecs-task-exec-role`,
      {
        name: `${name}-ecs-task-exec-role`,
        assumeRolePolicy,
        managedPolicyArns: [
          'arn:aws:iam::aws:policy/CloudWatchFullAccess',
          'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess',
        ],
        inlinePolicies: [
          secretManagerSecretsInlinePolicy,
          ...argsWithDefaults.taskExecutionRoleInlinePolicies,
        ],
      },
      { parent: this },
    );

    const execCmdInlinePolicy = {
      name: `${name}-ecs-exec`,
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
      `${name}-ecs-task-role`,
      {
        name: `${name}-ecs-task-role`,
        assumeRolePolicy,
        inlinePolicies: [
          execCmdInlinePolicy,
          ...argsWithDefaults.taskRoleInlinePolicies,
        ],
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

    this.taskDefinition = new aws.ecs.TaskDefinition(
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
        tags: argsWithDefaults.tags,
      },
      { parent: this },
    );

    this.serviceSecurityGroup = new aws.ec2.SecurityGroup(
      `${name}-security-group`,
      {
        vpcId: argsWithDefaults.vpc.vpcId,
        ingress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: '-1',
            securityGroups: [this.lbSecurityGroup.id],
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
      },
      { parent: this },
    );

    this.service = new aws.ecs.Service(
      `${name}-service`,
      {
        name,
        cluster: argsWithDefaults.cluster.id,
        launchType: 'FARGATE',
        desiredCount: argsWithDefaults.desiredCount,
        taskDefinition: this.taskDefinition.arn,
        enableExecuteCommand: true,
        loadBalancers: [
          {
            containerName: name,
            containerPort: argsWithDefaults.port,
            targetGroupArn: this.lbTargetGroup.arn,
          },
        ],
        networkConfiguration: {
          assignPublicIp: true,
          subnets: argsWithDefaults.vpc.publicSubnetIds,
          securityGroups: [this.serviceSecurityGroup.id],
        },
        tags: argsWithDefaults.tags,
      },
      {
        parent: this,
        dependsOn: [
          this.lb,
          this.lbTargetGroup,
          this.lbHttpListener,
          this.lbTlsListener,
        ],
      },
    );

    const autoscalingTarget = new aws.appautoscaling.Target(
      `${name}-autoscale-target`,
      {
        minCapacity: argsWithDefaults.minCount,
        maxCapacity: argsWithDefaults.maxCount,
        resourceId: pulumi.interpolate`service/${argsWithDefaults.cluster.name}/${this.service.name}`,
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
