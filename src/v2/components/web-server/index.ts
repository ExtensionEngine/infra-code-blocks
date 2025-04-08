import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { commonTags } from '../../../constants';
import { AcmCertificate } from '../../../components/acm-certificate';
import { EcsService } from '../ecs-service';

export namespace WebServer {
  export type Args = Pick<
    EcsService.Args,
    | 'cluster'
    | 'vpc'
    | 'containers'
    | 'desiredCount'
    | 'autoscaling'
    | 'size'
    | 'volumes'
    | 'taskExecutionRoleInlinePolicies'
    | 'taskRoleInlinePolicies'
    | 'tags'
  > & {
    port: pulumi.Input<number>;
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
}

const defaults = {
  healthCheckPath: '/healthcheck',
};

const webServerLoadBalancerNetworkConfig = {
  ingress: [{
    protocol: 'tcp',
    fromPort: 80,
    toPort: 80,
    cidrBlocks: ['0.0.0.0/0'],
  }, {
    protocol: 'tcp',
    fromPort: 443,
    toPort: 443,
    cidrBlocks: ['0.0.0.0/0'],
  }],
  egress: [{
    fromPort: 0,
    toPort: 0,
    protocol: '-1',
    cidrBlocks: ['0.0.0.0/0'],
  }]
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
    args: WebServer.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:WebServer', name, args, opts);

    const { vpc, domain, hostedZoneId } = args;

    if (domain && !hostedZoneId) {
      throw new Error(
        'WebServer:hostedZoneId must be provided when the domain is specified',
      );
    }
    const hasCustomDomain = !!domain && !!hostedZoneId;
    if (hasCustomDomain) {
      this.certificate = this.createTlsCertificate({ domain, hostedZoneId });
    }

    this.name = name;
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
    this.serviceSecurityGroup = this.createSecurityGroup(vpc);
    this.service = this.createEcsService(args);

    if (hasCustomDomain) {
      this.createDnsRecord({ domain, hostedZoneId });
    }

    this.registerOutputs();
  }

  private createTlsCertificate({
    domain,
    hostedZoneId,
  }: Pick<Required<WebServer.Args>, 'domain' | 'hostedZoneId'>) {
    return new AcmCertificate(`${domain}-acm-certificate`, {
      domain,
      hostedZoneId,
    }, { parent: this });
  }

  private createLoadBalancer({
    vpc,
    port,
    publicSubnetIds,
    healthCheckPath,
  }: Pick<
    WebServer.Args,
    'vpc' | 'publicSubnetIds' | 'port' | 'healthCheckPath'
  >) {
    const vpcId = pulumi.output(vpc).vpcId;
    const lbSecurityGroup = this.createLbSecurityGroup(vpcId);

    const lb = new aws.lb.LoadBalancer(`${this.name}-lb`, {
      namePrefix: 'lb-',
      loadBalancerType: 'application',
      subnets: publicSubnetIds,
      securityGroups: [lbSecurityGroup.id],
      internal: false,
      ipAddressType: 'ipv4',
      tags: { ...commonTags, Name: `${this.name}-lb` },
    }, { parent: this });

    const lbTargetGroup = this.createLbTargetGroup(port, vpcId, healthCheckPath);
    const lbHttpListener = this.createLbHttpListener(lb, lbTargetGroup);
    const lbTlsListener = this.certificate &&
      this.createLbTlsListener(lb, lbTargetGroup);

    return {
      lb,
      lbTargetGroup,
      lbHttpListener,
      lbTlsListener,
      lbSecurityGroup,
    };
  }

  private createLbTlsListener(
    lb: aws.lb.LoadBalancer,
    lbTargetGroup: aws.lb.TargetGroup
  ): aws.lb.Listener {
    if (!this.certificate) {
      throw new Error('Certificate must be provided to create TLS listener');
    }

    return new aws.lb.Listener(`${this.name}-lb-listener-443`, {
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
    }, { parent: this, dependsOn: [this.certificate] });
  }

  private createLbHttpListener(
    lb: aws.lb.LoadBalancer,
    lbTargetGroup: aws.lb.TargetGroup
  ): aws.lb.Listener {
    const httpsRedirectAction = {
      type: 'redirect',
      redirect: {
        port: '443',
        protocol: 'HTTPS',
        statusCode: 'HTTP_301',
      },
    };
    const defaultAction = this.certificate ? httpsRedirectAction : {
      type: 'forward',
      targetGroupArn: lbTargetGroup.arn,
    };

    return new aws.lb.Listener(`${this.name}-lb-listener-80`, {
      loadBalancerArn: lb.arn,
      port: 80,
      defaultActions: [defaultAction],
      tags: commonTags,
    }, { parent: this });
  }

  private createLbTargetGroup(
    port: pulumi.Input<number>,
    vpcId: awsx.ec2.Vpc['vpcId'],
    healthCheckPath: pulumi.Input<string> | undefined
  ): aws.lb.TargetGroup {
    return new aws.lb.TargetGroup(`${this.name}-lb-tg`, {
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
    }, { parent: this, dependsOn: [this.lb] });
  }

  private createLbSecurityGroup(
    vpcId: awsx.ec2.Vpc['vpcId']
  ): aws.ec2.SecurityGroup {
    return new aws.ec2.SecurityGroup(`${this.name}-lb-security-group`, {
      ...webServerLoadBalancerNetworkConfig,
      vpcId,
      tags: commonTags,
    }, { parent: this });
  }

  private createSecurityGroup(
    vpc: pulumi.Input<awsx.ec2.Vpc>
  ): aws.ec2.SecurityGroup {
    const vpcId = pulumi.output(vpc).vpcId;
    return new aws.ec2.SecurityGroup(
      `${this.name}-security-group`, {
      vpcId,
      ingress: [{
        fromPort: 0,
        toPort: 0,
        protocol: '-1',
        securityGroups: [this.lbSecurityGroup.id],
      }],
      egress: [{
        fromPort: 0,
        toPort: 0,
        protocol: '-1',
        cidrBlocks: ['0.0.0.0/0'],
      }],
      tags: commonTags,
    }, { parent: this });
  }

  private createEcsService(args: WebServer.Args): EcsService {
    return new EcsService(this.name, {
      ...args,
      enableServiceAutoDiscovery: false,
      loadBalancers: [{
        containerName: '',
        containerPort: 8080,
        targetGroupArn: this.lbTargetGroup.arn,
      }],
      assignPublicIp: true,
      securityGroup: this.serviceSecurityGroup,
    }, {
      parent: this,
      dependsOn: [this.lb, this.lbTargetGroup],
    });
  }

  private createDnsRecord({
    domain,
    hostedZoneId,
  }: Pick<Required<WebServer.Args>, 'domain' | 'hostedZoneId'>) {
    const albAliasRecord = new aws.route53.Record(`${this.name}-route53-record`, {
      type: 'A',
      name: domain,
      zoneId: hostedZoneId,
      aliases: [{
        name: this.lb.dnsName,
        zoneId: this.lb.zoneId,
        evaluateTargetHealth: true,
      }],
    }, { parent: this });
  }
}
