import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { CustomSize } from '../types/size';
import { PredefinedSize, commonTags } from '../constants';
import { ContainerDefinition } from '@pulumi/aws/ecs';
import { AcmCertificate } from './acm-certificate';
import { EcsArgs, assumeRolePolicy, awsRegion } from './ecs';

export type WebServerArgs = EcsArgs & {
  /**
   * The domain which will be used to access the service.
   * The domain or subdomain must belong to the provided hostedZone.
   */
  domain: pulumi.Input<string>;
  /**
   * The ID of the hosted zone.
   */
  hostedZoneId: pulumi.Input<string>;
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
   * Path for the health check request. Defaults to "/healtcheck".
   */
  healtCheckPath?: pulumi.Input<string>;
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
  name: string;
  certificate: AcmCertificate;
  logGroup: aws.cloudwatch.LogGroup;
  lbSecurityGroup: aws.ec2.SecurityGroup;
  lb: aws.lb.LoadBalancer;
  lbTargetGroup: aws.lb.TargetGroup;
  lbHttpListener: aws.lb.Listener;
  lbTlsListener: aws.lb.Listener;
  taskDefinition: aws.ecs.TaskDefinition;
  service: aws.ecs.Service;

  constructor(
    name: string,
    args: WebServerArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:WebServer', name, {}, opts);

    this.name = name;
    const { domain, hostedZoneId, vpc, port, healtCheckPath } = args;
    this.certificate = this.createTlsCertificate({ domain, hostedZoneId });
    this.logGroup = this.createLogGroup();
    const {
      lb,
      lbTargetGroup,
      lbHttpListener,
      lbTlsListener,
      lbSecurityGroup,
    } = this.createLoadBalancer({ vpc, port, healtCheckPath });
    this.lb = lb;
    this.lbTargetGroup = lbTargetGroup;
    this.lbHttpListener = lbHttpListener;
    this.lbTlsListener = lbTlsListener;
    this.lbSecurityGroup = lbSecurityGroup;
    this.taskDefinition = this.createTaskDefinition(args);
    this.service = this.createEcsService(args);
    this.createDnsRecord({ domain, hostedZoneId });
    this.enableAutoscaling(args);

    this.registerOutputs();
  }

  private createTlsCertificate({
    domain,
    hostedZoneId,
  }: Pick<WebServerArgs, 'domain' | 'hostedZoneId'>) {
    const certificate = new AcmCertificate(
      `${domain}-acm-certificate`,
      {
        domain,
        hostedZoneId,
      },
      { parent: this },
    );
    return certificate;
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

  private createLoadBalancer({
    vpc,
    port,
    healtCheckPath,
  }: Pick<WebServerArgs, 'vpc' | 'port' | 'healtCheckPath'>) {
    const lbSecurityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-lb-security-group`,
      {
        vpcId: vpc.vpcId,
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
        tags: commonTags,
      },
      { parent: this },
    );

    const lb = new aws.lb.LoadBalancer(
      `${this.name}-lb`,
      {
        namePrefix: 'lb-',
        loadBalancerType: 'application',
        subnets: vpc.publicSubnetIds,
        securityGroups: [lbSecurityGroup.id],
        internal: false,
        ipAddressType: 'ipv4',
        tags: { ...commonTags, Name: `${this.name}-lb` },
      },
      { parent: this },
    );

    const lbTargetGroup = new aws.lb.TargetGroup(
      `${this.name}-lb-tg`,
      {
        namePrefix: 'lb-tg-',
        port,
        protocol: 'HTTP',
        targetType: 'ip',
        vpcId: vpc.vpcId,
        healthCheck: {
          healthyThreshold: 3,
          unhealthyThreshold: 2,
          interval: 60,
          timeout: 5,
          path: healtCheckPath || defaults.healtCheckPath,
        },
        tags: { ...commonTags, Name: `${this.name}-lb-target-group` },
      },
      { parent: this, dependsOn: [this.lb] },
    );

    const lbHttpListener = new aws.lb.Listener(
      `${this.name}-lb-listener-80`,
      {
        loadBalancerArn: lb.arn,
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
        tags: commonTags,
      },
      { parent: this },
    );

    const lbTlsListener = new aws.lb.Listener(
      `${this.name}-lb-listener-443`,
      {
        loadBalancerArn: lb.arn,
        port: 443,
        protocol: 'HTTPS',
        sslPolicy: 'ELBSecurityPolicy-2016-08',
        certificateArn: this.certificate.certificate.arn,
        defaultActions: [
          {
            type: 'forward',
            targetGroupArn: lbTargetGroup.arn,
          },
        ],
        tags: commonTags,
      },
      { parent: this },
    );

    return {
      lb,
      lbTargetGroup,
      lbHttpListener,
      lbTlsListener,
      lbSecurityGroup,
    };
  }

  private createTaskDefinition(args: WebServerArgs) {
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
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this },
    );

    return taskDefinition;
  }

  private createEcsService(args: WebServerArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);

    const serviceSecurityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
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
        tags: commonTags,
      },
      { parent: this },
    );

    const service = new aws.ecs.Service(
      `${this.name}-service`,
      {
        name: this.name,
        cluster: argsWithDefaults.cluster.id,
        launchType: 'FARGATE',
        desiredCount: argsWithDefaults.desiredCount,
        taskDefinition: this.taskDefinition.arn,
        enableExecuteCommand: true,
        loadBalancers: [
          {
            containerName: this.name,
            containerPort: argsWithDefaults.port,
            targetGroupArn: this.lbTargetGroup.arn,
          },
        ],
        networkConfiguration: {
          assignPublicIp: true,
          subnets: argsWithDefaults.vpc.publicSubnetIds,
          securityGroups: [serviceSecurityGroup.id],
        },
        tags: { ...commonTags, ...argsWithDefaults.tags },
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
    return service;
  }

  private createDnsRecord({
    domain,
    hostedZoneId,
  }: Pick<WebServerArgs, 'domain' | 'hostedZoneId'>) {
    const albAliasRecord = new aws.route53.Record(
      `${this.name}-route53-record`,
      {
        type: 'A',
        name: domain,
        zoneId: hostedZoneId,
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
  }

  private enableAutoscaling(args: WebServerArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);

    const autoscalingTarget = new aws.appautoscaling.Target(
      `${this.name}-autoscale-target`,
      {
        minCapacity: argsWithDefaults.minCount,
        maxCapacity: argsWithDefaults.maxCount,
        resourceId: pulumi.interpolate`service/${argsWithDefaults.cluster.name}/${this.service.name}`,
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
          targetValue: 80,
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
          targetValue: 60,
        },
      },
      { parent: this },
    );
  }
}
