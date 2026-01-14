import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx-v3';
import { EcsService } from '../ecs-service';
import { WebServer } from '.';
import { OtelCollector } from '../../otel';
import { AcmCertificate } from '../acm-certificate';

export namespace WebServerBuilder {
  export type EcsConfig = Omit<WebServer.EcsConfig, 'vpc' | 'volumes'>;

  export type Args = Omit<
    WebServer.Args,
    | 'vpc'
    | 'cluster'
    | 'volumes'
    | 'domain'
    | 'hostedZoneId'
    | 'otelCollectorConfig'
  >;
}

export class WebServerBuilder {
  private _name: string;
  private _container?: WebServer.Container;
  private _vpc?: pulumi.Output<awsx.ec2.Vpc>;
  private _ecsConfig?: WebServerBuilder.EcsConfig;
  private _domain?: pulumi.Input<string>;
  private _hostedZoneId?: pulumi.Input<string>;
  private _certificate?: pulumi.Input<AcmCertificate>;
  private _healthCheckPath?: pulumi.Input<string>;
  private _loadBalancingAlgorithmType?: pulumi.Input<string>;
  private _otelCollector?: pulumi.Input<OtelCollector>;
  private _initContainers: pulumi.Input<WebServer.InitContainer>[] = [];
  private _sidecarContainers: pulumi.Input<WebServer.SidecarContainer>[] = [];
  private _volumes: EcsService.PersistentStorageVolume[] = [];

  constructor(name: string) {
    this._name = name;
  }

  public configureWebServer(
    image: WebServer.Container['image'],
    port: WebServer.Container['port'],
    config: Omit<WebServer.Container, 'image' | 'port'> = {},
  ): this {
    this._container = {
      image,
      port,
      ...config,
    };

    return this;
  }

  public configureEcs(config: WebServerBuilder.EcsConfig): this {
    this._ecsConfig = {
      cluster: config.cluster,
      deploymentController: config.deploymentController,
      desiredCount: config.desiredCount,
      autoscaling: config.autoscaling,
      size: config.size,
      taskExecutionRoleInlinePolicies: config.taskExecutionRoleInlinePolicies,
      taskRoleInlinePolicies: config.taskRoleInlinePolicies,
      tags: config.tags,
    };

    return this;
  }

  public withVpc(vpc: pulumi.Input<awsx.ec2.Vpc>): this {
    this._vpc = pulumi.output(vpc);

    return this;
  }

  public withVolume(volume: EcsService.PersistentStorageVolume): this {
    this._volumes.push(volume);

    return this;
  }

  public withCustomDomain(
    domain: pulumi.Input<string>,
    hostedZoneId: pulumi.Input<string>,
  ): this {
    this._domain = domain;
    this._hostedZoneId = hostedZoneId;

    return this;
  }

  public withCertificate(
    certificate: WebServerBuilder.Args['certificate'],
    hostedZoneId: pulumi.Input<string>,
    domain?: pulumi.Input<string>,
  ): this {
    this._certificate = certificate;
    this._hostedZoneId = hostedZoneId;
    this._domain = domain;

    return this;
  }

  public withInitContainer(container: WebServer.InitContainer): this {
    this._initContainers.push(container);

    return this;
  }

  public withSidecarContainer(container: WebServer.SidecarContainer): this {
    this._sidecarContainers.push(container);

    return this;
  }

  public withOtelCollector(collector: OtelCollector): this {
    this._otelCollector = collector;

    return this;
  }

  public withCustomHealthCheckPath(
    path: WebServer.Args['healthCheckPath'],
  ): this {
    this._healthCheckPath = path;

    return this;
  }

  public withLoadBalancingAlgorithm(algorithm: pulumi.Input<string>) {
    this._loadBalancingAlgorithmType = algorithm;

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): WebServer {
    if (!this._container) {
      throw new Error(
        'Web server not configured. Make sure to call WebServerBuilder.configureWebServer().',
      );
    }
    if (!this._ecsConfig) {
      throw new Error(
        'ECS not configured. Make sure to call WebServerBuilder.configureEcs().',
      );
    }
    if (!this._vpc) {
      throw new Error(
        'VPC not provided. Make sure to call WebServerBuilder.withVpc().',
      );
    }

    return new WebServer(
      this._name,
      {
        ...this._ecsConfig,
        ...this._container,
        vpc: this._vpc,
        volumes: this._volumes,
        domain: this._domain,
        hostedZoneId: this._hostedZoneId,
        certificate: this._certificate,
        healthCheckPath: this._healthCheckPath,
        loadBalancingAlgorithmType: this._loadBalancingAlgorithmType,
        otelCollector: this._otelCollector,
        initContainers: this._initContainers,
        sidecarContainers: this._sidecarContainers,
      },
      opts,
    );
  }
}
