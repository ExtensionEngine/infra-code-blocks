import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { commonTags } from '../../../constants';
import { AcmCertificate } from '../../../components/acm-certificate';
import { EcsService } from '../ecs-service';
import { WebServerLoadBalancer } from './load-balancer';
import { OtelCollector } from '../../otel';

export namespace WebServer {
  export type Container = Pick<
    EcsService.Container,
    'image' | 'environment' | 'secrets' | 'mountPoints'
  > & {
    port: pulumi.Input<number>;
  };

  export type EcsConfig = Pick<
    EcsService.Args,
    | 'cluster'
    | 'vpc'
    | 'volumes'
    | 'desiredCount'
    | 'autoscaling'
    | 'size'
    | 'taskExecutionRoleInlinePolicies'
    | 'taskRoleInlinePolicies'
    | 'tags'
  >;

  export type InitContainer = Omit<EcsService.Container, 'essential'>;
  export type SidecarContainer =
    & Omit<EcsService.Container, 'essential' | 'healthCheck'>
    & Required<Pick<EcsService.Container, 'healthCheck'>>;

  export type Args = EcsConfig
    & Container
    & {
      // TODO: Automatically use subnet IDs from passed `vpc`
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
      initContainers?: pulumi.Input<pulumi.Input<WebServer.InitContainer>[]>;
      sidecarContainers?: pulumi.Input<pulumi.Input<WebServer.SidecarContainer>[]>;
      otelCollector?: pulumi.Input<OtelCollector>;
    };
}

export class WebServer extends pulumi.ComponentResource {
  name: string;
  container: WebServer.Container;
  ecsConfig: WebServer.EcsConfig;
  service: pulumi.Output<EcsService>;
  serviceSecurityGroup: aws.ec2.SecurityGroup;
  lb: WebServerLoadBalancer;
  initContainers?: pulumi.Output<EcsService.Container[]>;
  sidecarContainers?: pulumi.Output<EcsService.Container[]>;
  volumes?: pulumi.Output<EcsService.PersistentStorageVolume[]>;
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

    this.initContainers = this.getInitContainers(args);
    this.sidecarContainers = this.getSidecarContainers(args);
    this.container = this.createWebServerContainer(args);
    this.ecsConfig = this.createEcsConfig(args);
    this.volumes = this.getVolumes(args);

    // TODO: Move output mapping to createEcsService
    this.service = pulumi.all([
      this.initContainers,
      this.sidecarContainers,
    ]).apply(([
      initContainers,
      sidecarContainers,
    ]) => {
      return this.createEcsService(
        this.container,
        this.lb,
        this.ecsConfig,
        this.volumes,
        [...initContainers, ...sidecarContainers]
      )
    });

    if (hasCustomDomain) {
      this.dnsRecord = this.createDnsRecord({ domain, hostedZoneId });
    }

    this.registerOutputs();
  }

  private getVolumes(args: WebServer.Args): pulumi.Output<EcsService.PersistentStorageVolume[]> {
    return pulumi.all([
      pulumi.output(args.volumes),
      args.otelCollector
    ]).apply(([passedVolumes, otelCollector]) => {
      const volumes = [];
      if (passedVolumes) volumes.push(...passedVolumes);
      if (otelCollector) volumes.push({ name: otelCollector.configVolume });

      return volumes;
    });
  }

  private getInitContainers(args: WebServer.Args): pulumi.Output<EcsService.Container[]> {
    return pulumi.all([
      pulumi.output(args.initContainers),
      args.otelCollector
    ]).apply(([passedInits, otelCollector]) => {
      const containers = [];
      if (passedInits) containers.push(...passedInits);
      if (otelCollector) containers.push(otelCollector.configContainer);

      return containers.map(container => ({ ...container, essential: false }));
    });
  }

  private getSidecarContainers(args: WebServer.Args): pulumi.Output<EcsService.Container[]> {
    return pulumi.all([
      pulumi.output(args.sidecarContainers),
      args.otelCollector
    ]).apply(([passedSidecars, otelCollector]) => {
      const containers = [];
      if (passedSidecars) containers.push(...passedSidecars);
      if (otelCollector) containers.push(otelCollector.container);

      return containers.map(container => ({ ...container, essential: true }));
    });
  }

  private getTaskRoleInlinePolicies(
    args: WebServer.Args
  ): pulumi.Output<EcsService.RoleInlinePolicy[]> {
    return pulumi.all([
      pulumi.output(args.taskExecutionRoleInlinePolicies),
      args.otelCollector
    ]).apply(([passedTaskRoleInlinePolicies, otelCollector]) => {
      const inlinePolicies = [];
      if (passedTaskRoleInlinePolicies) inlinePolicies.push(...passedTaskRoleInlinePolicies);
      if (otelCollector && otelCollector.taskRoleInlinePolicies) {
        inlinePolicies.push(...otelCollector.taskRoleInlinePolicies);
      }

      return inlinePolicies;
    });
  }


  private createEcsConfig(args: WebServer.Args): WebServer.EcsConfig {
    return {
      vpc: args.vpc,
      cluster: args.cluster,
      desiredCount: args.desiredCount,
      autoscaling: args.autoscaling,
      size: args.size,
      taskExecutionRoleInlinePolicies: args.taskExecutionRoleInlinePolicies,
      taskRoleInlinePolicies: this.getTaskRoleInlinePolicies(args),
      tags: args.tags,
    };
  }

  private createWebServerContainer(args: WebServer.Args): WebServer.Container {
    return {
      image: args.image,
      mountPoints: args.mountPoints,
      environment: args.environment,
      secrets: args.secrets,
      port: args.port
    };
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

  private createEcsService(
    webServerContainer: WebServer.Container,
    lb: WebServerLoadBalancer,
    ecsConfig: WebServer.EcsConfig,
    volumes?: pulumi.Output<EcsService.PersistentStorageVolume[]>,
    containers?: EcsService.Container[]
  ): EcsService {
    return new EcsService(`${this.name}-ecs`, {
      ...ecsConfig,
      volumes,
      containers: [{
        ...webServerContainer,
        name: this.name,
        portMappings: [EcsService.createTcpPortMapping(webServerContainer.port)],
        essential: true
      }, ...(containers || [])],
      enableServiceAutoDiscovery: false,
      loadBalancers: [{
        containerName: this.name,
        containerPort: webServerContainer.port,
        targetGroupArn: lb.targetGroup.arn,
      }],
      assignPublicIp: true,
      securityGroup: this.serviceSecurityGroup,
    }, {
      parent: this,
      dependsOn: [lb, lb.targetGroup],
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
