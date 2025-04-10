import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { commonTags } from '../../../constants';
import { AcmCertificate } from '../../../components/acm-certificate';
import { EcsService } from '../ecs-service';
import { WebServerLoadBalancer } from './load-balancer';
import { OtelCollector } from '../../otel/container';

const stack = pulumi.getStack();
const otelConfigVolume = { name: 'otel-config-efs-volume' };

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
    | 'desiredCount'
    | 'autoscaling'
    | 'size'
    | 'taskExecutionRoleInlinePolicies'
    | 'taskRoleInlinePolicies'
    | 'tags'
  >;

  export type Args = EcsConfig
    & Container
    & {
      // TODO: Automatically use subnet IDs from passed `vpc`
      publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
      volumes?: EcsService.Args['volumes'];
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
  vpc: pulumi.Output<awsx.ec2.Vpc>;
  container: WebServer.Container;
  ecsConfig: WebServer.EcsConfig;
  sidecarContainers: pulumi.Output<EcsService.Container>[] = [];
  service?: pulumi.Output<EcsService>;
  serviceSecurityGroup?: aws.ec2.SecurityGroup;
  lb?: WebServerLoadBalancer;
  domain?: pulumi.Input<string>;
  hostedZoneId?: pulumi.Input<string>;
  certificate?: AcmCertificate;
  dnsRecord?: aws.route53.Record;
  healthCheckPath?: pulumi.Input<string>;

  private _volumesInput: WebServer.Args['volumes'];
  private _volumes: EcsService.PersistentStorageVolume[] = [];

  constructor(
    name: string,
    args: WebServer.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:WebServer', name, args, opts);
    this.vpc = pulumi.output(args.vpc);
    this.name = name;
    this._volumesInput = args.volumes;
    this.container = {
      image: args.image,
      mountPoints: args.mountPoints,
      environment: args.environment,
      secrets: args.secrets,
      port: args.port
    };
    this.ecsConfig = {
      vpc: args.vpc,
      cluster: args.cluster,
      desiredCount: args.desiredCount,
      autoscaling: args.autoscaling,
      size: args.size,
      taskExecutionRoleInlinePolicies: args.taskExecutionRoleInlinePolicies,
      taskRoleInlinePolicies: args.taskRoleInlinePolicies,
      tags: args.tags,
    }
    this.healthCheckPath = args.healthCheckPath;
  }

  public get hasCustomDomain(): boolean {
    return !!this.domain && !!this.hostedZoneId;
  }

  public get volumes(): pulumi.Output<EcsService.PersistentStorageVolume[]> {
    const volumesInput = pulumi.output(this._volumesInput)
    return volumesInput.apply(input => [
      ...input ?? [],
      ...this._volumes
    ]);
  }

  public withCustomDomain(
    domain: pulumi.Input<string>,
    hostedZoneId: pulumi.Input<string>
  ): this {
    this.domain = domain;
    this.hostedZoneId = hostedZoneId;
    this.certificate = this.createTlsCertificate({
      domain,
      hostedZoneId
    });

    return this;
  }

  public withOtelCollector(config: pulumi.Input<string>): this {
    this._volumes.push(otelConfigVolume);
    const collector = pulumi.output(config)
      .apply(config => this.createOtelCollector(config));
    this.sidecarContainers.push(
      ...[collector.configContainer, collector.container]
    );

    return this;
  }

  public build(): this {
    const lb = new WebServerLoadBalancer(`${this.name}-lb`, {
      vpc: this.vpc,
      port: this.container.port,
      certificate: this.certificate?.certificate,
      healthCheckPath: this.healthCheckPath
    });
    this.lb = lb;
    this.serviceSecurityGroup = this.createSecurityGroup(this.vpc, lb);

    this.service = pulumi.all([
      this.volumes,
      this.sidecarContainers
    ]).apply(([
      volumes,
      sidecarContainers
    ]) => this.createEcsService(
      this.container,
      volumes,
      lb,
      this.ecsConfig,
      sidecarContainers
    ));

    // Typescript doesn't recognize non-null check in the hasCustomDomain getter
    if (this.hasCustomDomain && this.domain && this.hostedZoneId) {
      this.dnsRecord = this.createDnsRecord(
        this.domain,
        this.hostedZoneId,
        this.lb.lb
      );
    }

    this.registerOutputs();
    return this;
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
    vpc: pulumi.Input<awsx.ec2.Vpc>,
    lb: WebServerLoadBalancer
  ): aws.ec2.SecurityGroup {
    const vpcId = pulumi.output(vpc).vpcId;
    return new aws.ec2.SecurityGroup(
      `${this.name}-security-group`, {
      vpcId,
      ingress: [{
        fromPort: 0,
        toPort: 0,
        protocol: '-1',
        securityGroups: [lb.securityGroup.id],
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
    container: WebServer.Container,
    volumes: EcsService.PersistentStorageVolume[],
    lb: WebServerLoadBalancer,
    ecsConfig: WebServer.EcsConfig,
    sidecarContainers: EcsService.Container[]
  ): EcsService {
    return new EcsService(`${this.name}-ecs`, {
      ...ecsConfig,
      volumes,
      containers: [{
        ...container,
        name: this.name,
        portMappings: [EcsService.createTcpPortMapping(container.port)],
        essential: true
      }, ...sidecarContainers],
      enableServiceAutoDiscovery: false,
      loadBalancers: [{
        containerName: this.name,
        containerPort: container.port,
        targetGroupArn: lb.targetGroup.arn,
      }],
      assignPublicIp: true,
      securityGroup: this.serviceSecurityGroup,
    }, {
      parent: this,
      dependsOn: [lb, lb.targetGroup],
    });
  }

  private createDnsRecord(
    domain: pulumi.Input<string>,
    hostedZoneId: pulumi.Input<string>,
    lb: aws.lb.LoadBalancer
  ): aws.route53.Record {
    return new aws.route53.Record(`${this.name}-route53-record`, {
      type: 'A',
      name: domain,
      zoneId: hostedZoneId,
      aliases: [{
        name: lb.dnsName,
        zoneId: lb.zoneId,
        evaluateTargetHealth: true,
      }],
    }, { parent: this });
  }

  private createOtelCollector(config: string) {
    return new OtelCollector({
      containerName: `${this.name}-otel-collector`,
      serviceName: this.name,
      env: stack,
      config,
      configVolumeName: otelConfigVolume.name,
    });
  }
}
