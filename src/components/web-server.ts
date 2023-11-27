import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { commonTags } from '../constants';
import { AcmCertificate } from './acm-certificate';
import { EcsService, EcsServiceArgs } from './ecs-service';

export type WebServerArgs = Pick<
  EcsServiceArgs,
  | 'image'
  | 'port'
  | 'cluster'
  | 'vpcId'
  | 'vpcCidrBlock'
  | 'desiredCount'
  | 'autoscaling'
  | 'size'
  | 'environment'
  | 'secrets'
  | 'taskExecutionRoleInlinePolicies'
  | 'taskRoleInlinePolicies'
  | 'tags'
> & {
  publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  /**
   * The domain which will be used to access the service.
   * The domain or subdomain must belong to the provided hostedZone.
   */
  domain?: pulumi.Input<string>;
  /**
   * The ID of the hosted zone.
   */
  hostedZoneId?: pulumi.Input<string>;
  /**
   * Path for the health check request. Defaults to "/healthcheck".
   */
  healthCheckPath?: pulumi.Input<string>;
};

const defaults = {
  healthCheckPath: '/healthcheck',
};

export class WebServer extends pulumi.ComponentResource {
  name: string;
  service: EcsService;
  lbSecurityGroup: aws.ec2.SecurityGroup;
  serviceSecurityGroup: aws.ec2.SecurityGroup;
  lb: aws.lb.LoadBalancer;
  lbTargetGroup: aws.lb.TargetGroup;
  lbHttpListener: aws.lb.Listener;
  certificate?: AcmCertificate;
  lbTlsListener?: aws.lb.Listener;

  constructor(
    name: string,
    args: WebServerArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:WebServer', name, args, opts);

    const { vpcId, domain, hostedZoneId } = args;

    const hasCustomDomain = !!domain && !!hostedZoneId;
    if (domain && !hostedZoneId) {
      throw new Error(
        'WebServer:hostedZoneId must be provided when the domain is specified',
      );
    }

    this.name = name;
    if (hasCustomDomain) {
      this.certificate = this.createTlsCertificate({ domain, hostedZoneId });
    }
    const {
      lb,
      lbTargetGroup,
      lbHttpListener,
      lbTlsListener,
      lbSecurityGroup,
    } = this.createLoadBalancer(args);
    this.lb = lb;
    this.lbTargetGroup = lbTargetGroup;
    this.lbHttpListener = lbHttpListener;
    this.lbTlsListener = lbTlsListener;
    this.lbSecurityGroup = lbSecurityGroup;
    this.serviceSecurityGroup = this.createSecurityGroup(vpcId);
    this.service = this.createEcsService(args);

    if (hasCustomDomain) {
      this.createDnsRecord({ domain, hostedZoneId });
    }

    this.registerOutputs();
  }

  private createTlsCertificate({
    domain,
    hostedZoneId,
  }: Pick<Required<WebServerArgs>, 'domain' | 'hostedZoneId'>) {
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
    vpcId,
    publicSubnetIds,
    port,
    healthCheckPath,
  }: Pick<
    WebServerArgs,
    'vpcId' | 'publicSubnetIds' | 'port' | 'healthCheckPath'
  >) {
    const lbSecurityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-lb-security-group`,
      {
        vpcId,
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
        subnets: publicSubnetIds,
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
        vpcId,
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

    const defaultAction = this.certificate
      ? {
          type: 'redirect',
          redirect: {
            port: '443',
            protocol: 'HTTPS',
            statusCode: 'HTTP_301',
          },
        }
      : {
          type: 'forward',
          targetGroupArn: lbTargetGroup.arn,
        };

    const lbHttpListener = new aws.lb.Listener(
      `${this.name}-lb-listener-80`,
      {
        loadBalancerArn: lb.arn,
        port: 80,
        defaultActions: [defaultAction],
        tags: commonTags,
      },
      { parent: this },
    );

    let lbTlsListener = undefined;
    if (this.certificate) {
      lbTlsListener = new aws.lb.Listener(
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
    }

    return {
      lb,
      lbTargetGroup,
      lbHttpListener,
      lbTlsListener,
      lbSecurityGroup,
    };
  }

  private createSecurityGroup(vpcId: WebServerArgs['vpcId']) {
    const securityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId,
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
    return securityGroup;
  }

  private createEcsService(args: WebServerArgs) {
    const service = new EcsService(
      this.name,
      {
        ...args,
        enableServiceAutoDiscovery: false,
        lbTargetGroupArn: this.lbTargetGroup.arn,
        assignPublicIp: true,
        subnetIds: args.publicSubnetIds,
        securityGroup: this.serviceSecurityGroup,
      },
      {
        parent: this,
        dependsOn: [this.lb, this.lbTargetGroup],
      },
    );
    return service;
  }

  private createDnsRecord({
    domain,
    hostedZoneId,
  }: Pick<Required<WebServerArgs>, 'domain' | 'hostedZoneId'>) {
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
