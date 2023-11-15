import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { commonTags } from '../constants';
import { AcmCertificate } from './acm-certificate';
import { EcsService, RoleInlinePolicy, defaults } from './ecs-service';
import { Size } from '../types/size';

export type WebServerArgs = {
  /**
   * The ECR image used to start a container.
   */
  image: pulumi.Input<string>;
  /*
   * Exposed service port.
   */
  port: pulumi.Input<number>;
  /**
   * The domain which will be used to access the service.
   * The domain or subdomain must belong to the provided hostedZone.
   */
  domain: pulumi.Input<string>;
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
   * Path for the healthh check request. Defaults to "/healthcheck".
   */
  healthCheckPath?: pulumi.Input<string>;
  /**
   * The aws.ecs.Cluster resource.
   */
  cluster: aws.ecs.Cluster;
  /**
   * The awsx.ec2.Vpc resource.
   */
  vpc: awsx.ec2.Vpc;
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
   * The ID of the hosted zone.
   */
  hostedZoneId: pulumi.Input<string>;
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

export class WebServer extends pulumi.ComponentResource {
  name: string;
  service: EcsService;
  certificate: AcmCertificate;
  lbSecurityGroup: aws.ec2.SecurityGroup;
  lb: aws.lb.LoadBalancer;
  lbTargetGroup: aws.lb.TargetGroup;
  lbHttpListener: aws.lb.Listener;
  lbTlsListener: aws.lb.Listener;

  constructor(
    name: string,
    args: WebServerArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:WebServer', name, args, opts);

    const {
      image,
      port,
      size,
      cluster,
      vpc,
      environment,
      secrets,
      healthCheckPath,
      domain,
      hostedZoneId,
      desiredCount,
      minCount,
      maxCount,
      taskExecutionRoleInlinePolicies,
      taskRoleInlinePolicies,
      tags,
    } = args;

    this.name = name;
    this.certificate = this.createTlsCertificate({ domain, hostedZoneId });
    const {
      lb,
      lbTargetGroup,
      lbHttpListener,
      lbTlsListener,
      lbSecurityGroup,
    } = this.createLoadBalancer({ vpc, port, healthCheckPath });
    this.lb = lb;
    this.lbTargetGroup = lbTargetGroup;
    this.lbHttpListener = lbHttpListener;
    this.lbTlsListener = lbTlsListener;
    this.lbSecurityGroup = lbSecurityGroup;

    const securityGroup = new aws.ec2.SecurityGroup(
      `${name}-security-group`,
      {
        vpcId: vpc.vpcId,
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

    this.service = new EcsService(
      name,
      {
        image,
        port,
        cluster,
        ...(desiredCount && { desiredCount }),
        ...(minCount && { minCount }),
        ...(maxCount && { maxCount }),
        ...(size && { size }),
        environment,
        secrets,
        enableServiceAutoDiscovery: false,
        enableAutoScaling: true,
        lbTargetGroupArn: lbTargetGroup.arn,
        assignPublicIp: true,
        vpc,
        securityGroup,
        ...(taskExecutionRoleInlinePolicies && {
          taskExecutionRoleInlinePolicies,
        }),
        ...(taskRoleInlinePolicies && { taskRoleInlinePolicies }),
        ...(tags && { tags }),
      },
      { ...opts, parent: this },
    );

    this.createDnsRecord({ domain, hostedZoneId });

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

  private createLoadBalancer({
    vpc,
    port,
    healthCheckPath,
  }: Pick<WebServerArgs, 'vpc' | 'port' | 'healthCheckPath'>) {
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
          path: healthCheckPath || defaults.healthCheckPath,
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
}
