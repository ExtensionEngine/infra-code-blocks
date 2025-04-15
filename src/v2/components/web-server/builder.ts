import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import { EcsService } from '../ecs-service';
import { WebServer } from '.';

export namespace WebServerBuilder {
  export type EcsConfig = Omit<WebServer.EcsConfig, 'vpc' | 'volumes'>;

  export type Args = Omit<
    WebServer.Args,
    | 'vpc'
    | 'publicSubnetIds'
    | 'cluster'
    | 'volumes'
    | 'domain'
    | 'hostedZoneId'
    | 'otelCollectorConfig'
  >
}

export class WebServerBuilder {
  private _name: string;
  private _container?: WebServer.Container;
  private _vpc?: pulumi.Output<awsx.ec2.Vpc>;
  private _ecsConfig?: WebServerBuilder.EcsConfig;
  private _domain?: pulumi.Input<string>;
  private _hostedZoneId?: pulumi.Input<string>;
  private _healthCheckPath?: pulumi.Input<string>;
  private _otelCollectorConfig?: pulumi.Input<string>;
  private _initContainers: pulumi.Input<WebServer.InitContainer>[] = [];
  private _sidecarContainers: pulumi.Input<WebServer.SidecarContainer>[] = [];
  private _volumes: EcsService.PersistentStorageVolume[] = [];

  constructor(name: string) {
    this._name = name;
  }

  public configureWebServer(
    image: WebServer.Container['image'],
    port: WebServer.Container['port'],
    config: Omit<WebServer.Container, 'image' | 'port'> = {}
  ): this {
    this._container = {
      image,
      port,
      ...config
    };

    return this;
  }

  public configureEcs(config: WebServerBuilder.EcsConfig): this {
    this._ecsConfig = {
      cluster: config.cluster,
      desiredCount: config.desiredCount,
      autoscaling: config.autoscaling,
      size: config.size,
      taskExecutionRoleInlinePolicies: config.taskExecutionRoleInlinePolicies,
      taskRoleInlinePolicies: config.taskRoleInlinePolicies,
      tags: config.tags,
    }

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
    hostedZoneId: pulumi.Input<string>
  ): this {
    this._domain = domain;
    this._hostedZoneId = hostedZoneId;

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

  public withOtelCollector(config: pulumi.Input<string>): this {
    this._otelCollectorConfig = config;

    return this;
  }

  public withCustomHealthCheckPath(path: WebServer.Args['healthCheckPath']) {
    this._healthCheckPath = path;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): WebServer {
    if (!this._container) {
      throw new Error('Web server not configured. Make sure to call WebServerBuilder.configureWebServer().');
    }
    if (!this._ecsConfig) {
      throw new Error('ECS not configured. Make sure to call WebServerBuilder.configureEcs().');
    }
    if (!this._vpc) {
      throw new Error('VPC not provided. Make sure to call WebServerBuilder.withVpc().');
    }

    return new WebServer(this._name, {
      ...this._ecsConfig,
      ...this._container,
      vpc: this._vpc,
      volumes: this._volumes,
      publicSubnetIds: this._vpc.publicSubnetIds,
      domain: this._domain,
      hostedZoneId: this._hostedZoneId,
      healthCheckPath: this._healthCheckPath,
      otelCollectorConfig: this._otelCollectorConfig,
      initContainers: this._initContainers,
      sidecarContainers: this._sidecarContainers
    }, opts)
  }
}
