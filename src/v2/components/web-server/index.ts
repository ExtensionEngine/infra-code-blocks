import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { commonTags } from '../../../constants';
import { AcmCertificate } from '../../../components/acm-certificate';
import { EcsService } from '../ecs-service';
import { WebServerLoadBalancer } from './load-balancer';

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
    hostedZoneId?: pulumi.Input<string>;
    /**
     * Path for the load balancer target group health check request.
     *
     * @default
     * "/healthcheck"
     */
    healthCheckPath?: pulumi.Input<string>;
  };
}

export class WebServer extends pulumi.ComponentResource {
  name: string;
  service: EcsService;
  serviceSecurityGroup: aws.ec2.SecurityGroup;
  lb: WebServerLoadBalancer;
  certificate?: AcmCertificate;
  dnsRecord?: aws.route53.Record;

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
    this.lb = new WebServerLoadBalancer(`${this.name}-lb`, {
      vpc,
      port: args.port,
      certificate: this.certificate?.certificate,
      healthCheckPath: args.healthCheckPath
    });
    this.serviceSecurityGroup = this.createSecurityGroup(vpc);
    this.service = this.createEcsService(args);

    if (hasCustomDomain) {
      this.dnsRecord = this.createDnsRecord({ domain, hostedZoneId });
    }

    this.registerOutputs();
  }

  private createTlsCertificate({
    domain,
    hostedZoneId,
  }: Pick<Required<WebServer.Args>, 'domain' | 'hostedZoneId'>): AcmCertificate {
    return new AcmCertificate(`${domain}-acm-certificate`, {
      domain,
      hostedZoneId,
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
        securityGroups: [this.lb.securityGroup.id],
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
        containerName: this.name,
        containerPort: args.port,
        targetGroupArn: this.lb.targetGroup.arn,
      }],
      assignPublicIp: true,
      securityGroup: this.serviceSecurityGroup,
    }, {
      parent: this,
      dependsOn: [this.lb, this.lb.targetGroup],
    });
  }

  private createDnsRecord({
    domain,
    hostedZoneId,
  }: Pick<
    Required<WebServer.Args>,
    'domain' | 'hostedZoneId'
  >): aws.route53.Record {
    return new aws.route53.Record(`${this.name}-route53-record`, {
      type: 'A',
      name: domain,
      zoneId: hostedZoneId,
      aliases: [{
        name: this.lb.lb.dnsName,
        zoneId: this.lb.lb.zoneId,
        evaluateTargetHealth: true,
      }],
    }, { parent: this });
  }
}
