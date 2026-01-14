import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws-v7';
import * as awsx from '@pulumi/awsx-v3';
import { commonTags } from '../../../constants';
import { AcmCertificate } from '../acm-certificate';
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
    | 'deploymentController'
    | 'desiredCount'
    | 'autoscaling'
    | 'size'
    | 'taskExecutionRoleInlinePolicies'
    | 'taskRoleInlinePolicies'
    | 'tags'
  >;

  export type InitContainer = Omit<EcsService.Container, 'essential'>;
  export type SidecarContainer = Omit<
    EcsService.Container,
    'essential' | 'healthCheck'
  > &
    Required<Pick<EcsService.Container, 'healthCheck'>>;

  export type Args = EcsConfig &
    Container & {
      /**
       * The domain which will be used to access the service.
       * The domain or subdomain must belong to the provided hostedZone.
       */
      domain?: pulumi.Input<string>;
      hostedZoneId?: pulumi.Input<string>;
      /**
       * If provided without `domain` argument, Route53 A records will be created for the certificate's
       * primary domain and all subject alternative names (SANs).
       * If `domain` argument is also provided, only a single A record for that domain will be created.
       */
      certificate?: pulumi.Input<AcmCertificate>;
      /**
       * Path for the load balancer target group health check request.
       *
       * @default
       * "/healthcheck"
       */
      healthCheckPath?: pulumi.Input<string>;
      loadBalancingAlgorithmType?: pulumi.Input<string>;
      initContainers?: pulumi.Input<pulumi.Input<WebServer.InitContainer>[]>;
      sidecarContainers?: pulumi.Input<
        pulumi.Input<WebServer.SidecarContainer>[]
      >;
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
  certificate?: pulumi.Output<AcmCertificate>;
  dnsRecords?: pulumi.Output<aws.route53.Record[]>;

  constructor(
    name: string,
    args: WebServer.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:WebServer', name, args, opts);
    const { vpc, domain, hostedZoneId, certificate } = args;

    if ((domain || certificate) && !hostedZoneId) {
      throw new Error(
        'HostedZoneId must be provided when domain or certificate are provided',
      );
    }

    const hasCustomDomain = !!domain && !!hostedZoneId;
    if (certificate) {
      this.certificate = pulumi.output(certificate);
    } else if (hasCustomDomain) {
      this.certificate = pulumi.output(
        this.createTlsCertificate({ domain, hostedZoneId }),
      );
    }

    this.name = name;
    this.lb = new WebServerLoadBalancer(
      `${this.name}-lb`,
      {
        vpc,
        port: args.port,
        certificate: this.certificate?.certificate,
        healthCheckPath: args.healthCheckPath,
        loadBalancingAlgorithmType: args.loadBalancingAlgorithmType,
      },
      { parent: this },
    );
    this.serviceSecurityGroup = this.createSecurityGroup(vpc);

    this.initContainers = this.getInitContainers(args);
    this.sidecarContainers = this.getSidecarContainers(args);
    this.container = this.createWebServerContainer(args);
    this.ecsConfig = this.createEcsConfig(args);
    this.volumes = this.getVolumes(args);

    this.service = this.createEcsService(
      this.container,
      this.lb,
      this.ecsConfig,
      this.volumes,
      this.initContainers,
      this.sidecarContainers,
    );

    if (this.certificate) {
      this.dnsRecords = this.createDnsRecords(
        this.certificate,
        hostedZoneId!,
        domain,
      );
    }

    this.registerOutputs();
  }

  private getVolumes(
    args: WebServer.Args,
  ): pulumi.Output<EcsService.PersistentStorageVolume[]> {
    return pulumi
      .all([pulumi.output(args.volumes), args.otelCollector])
      .apply(([passedVolumes, otelCollector]) => {
        const volumes = [];
        if (passedVolumes) volumes.push(...passedVolumes);
        if (otelCollector) volumes.push({ name: otelCollector.configVolume });

        return volumes;
      });
  }

  private getInitContainers(
    args: WebServer.Args,
  ): pulumi.Output<EcsService.Container[]> {
    return pulumi
      .all([pulumi.output(args.initContainers), args.otelCollector])
      .apply(([passedInits, otelCollector]) => {
        const containers = [];
        if (passedInits) containers.push(...passedInits);
        if (otelCollector) containers.push(otelCollector.configContainer);

        return containers.map(container => ({
          ...container,
          essential: false,
        }));
      });
  }

  private getSidecarContainers(
    args: WebServer.Args,
  ): pulumi.Output<EcsService.Container[]> {
    return pulumi
      .all([pulumi.output(args.sidecarContainers), args.otelCollector])
      .apply(([passedSidecars, otelCollector]) => {
        const containers = [];
        if (passedSidecars) containers.push(...passedSidecars);
        if (otelCollector) containers.push(otelCollector.container);

        return containers.map(container => ({ ...container, essential: true }));
      });
  }

  private getTaskRoleInlinePolicies(
    args: WebServer.Args,
  ): pulumi.Output<EcsService.RoleInlinePolicy[]> {
    return pulumi
      .all([
        pulumi.output(args.taskExecutionRoleInlinePolicies),
        args.otelCollector,
      ])
      .apply(([passedTaskRoleInlinePolicies, otelCollector]) => {
        const inlinePolicies = [];
        if (passedTaskRoleInlinePolicies)
          inlinePolicies.push(...passedTaskRoleInlinePolicies);
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
      deploymentController: args.deploymentController,
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
      port: args.port,
    };
  }

  private createTlsCertificate({
    domain,
    hostedZoneId,
  }: Pick<
    Required<WebServer.Args>,
    'domain' | 'hostedZoneId'
  >): AcmCertificate {
    return new AcmCertificate(
      `${domain}-acm-certificate`,
      {
        domain,
        hostedZoneId,
      },
      { parent: this },
    );
  }

  private createSecurityGroup(
    vpc: pulumi.Input<awsx.ec2.Vpc>,
  ): aws.ec2.SecurityGroup {
    const vpcId = pulumi.output(vpc).vpcId;
    return new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId,
        ingress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: '-1',
            securityGroups: [this.lb.securityGroup.id],
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

  private createEcsService(
    webServerContainer: WebServer.Container,
    lb: WebServerLoadBalancer,
    ecsConfig: WebServer.EcsConfig,
    volumes?: pulumi.Output<EcsService.PersistentStorageVolume[]>,
    initContainers?: pulumi.Output<EcsService.Container[]>,
    sidecarContainers?: pulumi.Output<EcsService.Container[]>,
  ): pulumi.Output<EcsService> {
    return pulumi
      .all([
        initContainers || pulumi.output([]),
        sidecarContainers || pulumi.output([]),
      ])
      .apply(([inits, sidecars]) => {
        return new EcsService(
          `${this.name}-ecs`,
          {
            ...ecsConfig,
            volumes,
            containers: [
              {
                ...webServerContainer,
                name: this.name,
                portMappings: [
                  EcsService.createTcpPortMapping(webServerContainer.port),
                ],
                essential: true,
              },
              ...inits,
              ...sidecars,
            ],
            enableServiceAutoDiscovery: false,
            loadBalancers: [
              {
                containerName: this.name,
                containerPort: webServerContainer.port,
                targetGroupArn: lb.targetGroup.arn,
              },
            ],
            assignPublicIp: true,
            securityGroup: this.serviceSecurityGroup,
          },
          {
            parent: this,
            dependsOn: [lb, lb.targetGroup],
          },
        );
      });
  }

  private createDnsRecords(
    certificate: pulumi.Output<AcmCertificate>,
    hostedZoneId: pulumi.Input<string>,
    domain?: pulumi.Input<string>,
  ): pulumi.Output<aws.route53.Record[]> {
    if (domain) {
      const record = new aws.route53.Record(
        `${this.name}-route53-record`,
        {
          type: 'A',
          name: domain,
          zoneId: hostedZoneId,
          aliases: [
            {
              name: this.lb.lb.dnsName,
              zoneId: this.lb.lb.zoneId,
              evaluateTargetHealth: true,
            },
          ],
        },
        { parent: this },
      );

      return pulumi.output([record]);
    }

    const records = pulumi
      .all([
        certificate.certificate.domainName,
        certificate.certificate.subjectAlternativeNames,
      ])
      .apply(([primaryDomain, sans]) => {
        const allDomains = [
          primaryDomain,
          ...(sans || []).filter(san => san !== primaryDomain),
        ];

        return allDomains.map(
          (domain, index) =>
            new aws.route53.Record(
              `${this.name}-route53-record${index === 0 ? '' : `-${index}`}`,
              {
                type: 'A',
                name: domain,
                zoneId: hostedZoneId,
                aliases: [
                  {
                    name: this.lb.lb.dnsName,
                    zoneId: this.lb.lb.zoneId,
                    evaluateTargetHealth: true,
                  },
                ],
              },
              { parent: this },
            ),
        );
      });

    return records;
  }
}
