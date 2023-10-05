import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as upstash from '@upstash/pulumi';
import { Rds, RdsArgs } from './rds';
import { WebServer, WebServerArgs } from './web-server';
import { Redis, RedisArgs } from './redis';
import { StaticSite, StaticSiteArgs } from './static-site';
import { Environment } from '../constants';

export type Service = Rds | Redis | StaticSite | WebServer;
export type Services = Record<string, Service>;

type ServiceArgs = {
  /**
   * The unique name for the service.
   */
  serviceName: string;
};

export type DatabaseService = { type: 'DATABASE' } & ServiceArgs &
  Omit<RdsArgs, 'vpc'>;

export type RedisService = { type: 'REDIS' } & ServiceArgs &
  Pick<RedisArgs, 'dbName' | 'region'>;

export type StaticSiteService = { type: 'STATIC_SITE' } & ServiceArgs &
  Omit<StaticSiteArgs, 'hostedZoneId'>;

export type WebServerService = {
  type: 'WEB_SERVER';
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
} & ServiceArgs &
  Omit<WebServerArgs, 'cluster' | 'vpc' | 'hostedZoneId' | 'environment'>;

export type Environment = (typeof Environment)[keyof typeof Environment];

export type ProjectArgs = {
  services: (
    | DatabaseService
    | RedisService
    | StaticSiteService
    | WebServerService
  )[];
  hostedZoneId: pulumi.Input<string>;
  environment: Environment;
};

export class Project extends pulumi.ComponentResource {
  name: string;
  hostedZoneId: pulumi.Input<string>;
  environment: Environment;
  vpc: awsx.ec2.Vpc;
  cluster: aws.ecs.Cluster | null = null;
  upstashProvider: upstash.Provider | null = null;
  services: Services = {};

  constructor(
    name: string,
    args: ProjectArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Project', name, {}, opts);
    const { services, environment, hostedZoneId } = args;
    this.name = name;
    this.hostedZoneId = hostedZoneId;
    this.environment = environment;

    this.vpc = this.createVpc();
    this.createServices(services);

    this.registerOutputs();
  }

  private createVpc() {
    const vpc = new awsx.ec2.Vpc(
      `${this.name}-vpc`,
      {
        numberOfAvailabilityZones: 2,
        enableDnsHostnames: true,
        enableDnsSupport: true,
      },
      { parent: this },
    );
    return vpc;
  }

  private createServices(services: ProjectArgs['services']) {
    const hasRedisService = services.some(it => it.type === 'REDIS');
    const hasWebServerService = services.some(it => it.type === 'WEB_SERVER');
    if (hasRedisService) this.createRedisPrerequisites();
    if (hasWebServerService) this.createWebServerPrerequisites();
    services.forEach(it => {
      if (it.type === 'DATABASE') this.createDatabaseService(it);
      if (it.type === 'REDIS') this.createRedisService(it);
      if (it.type === 'STATIC_SITE') this.createStaticSiteService(it);
      if (it.type === 'WEB_SERVER') this.createWebServerService(it);
    });
  }

  private createRedisPrerequisites() {
    const upstashConfig = new pulumi.Config('upstash');

    this.upstashProvider = new upstash.Provider('upstash', {
      email: upstashConfig.requireSecret('email'),
      apiKey: upstashConfig.requireSecret('apiKey'),
    });
  }

  private createWebServerPrerequisites() {
    this.cluster = new aws.ecs.Cluster(
      `${this.name}-cluster`,
      { name: this.name },
      { parent: this },
    );
  }

  private createDatabaseService(options: DatabaseService) {
    const { serviceName, type, ...rdsOptions } = options;
    const service = new Rds(
      serviceName,
      {
        ...rdsOptions,
        vpc: this.vpc,
      },
      { parent: this },
    );
    this.services[serviceName] = service;
  }

  private createRedisService(options: RedisService) {
    if (!this.upstashProvider) return;
    const { serviceName, ...redisOptions } = options;
    const service = new Redis(serviceName, redisOptions, {
      parent: this,
      provider: this.upstashProvider,
    });
    this.services[options.serviceName] = service;
  }

  private createStaticSiteService(options: StaticSiteService) {
    const { serviceName, ...staticSiteOptions } = options;
    const service = new StaticSite(
      serviceName,
      {
        ...staticSiteOptions,
        hostedZoneId: this.hostedZoneId,
      },
      { parent: this },
    );
    this.services[serviceName] = service;
  }

  private createWebServerService(options: WebServerService) {
    if (!this.cluster) return;

    const { serviceName, environment, ...ecsOptions } = options;
    const parsedEnv =
      typeof environment === 'function'
        ? environment(this.services)
        : environment;

    const service = new WebServer(
      serviceName,
      {
        ...ecsOptions,
        cluster: this.cluster,
        vpc: this.vpc,
        hostedZoneId: this.hostedZoneId,
        environment: parsedEnv,
      },
      { parent: this },
    );
    this.services[options.serviceName] = service;
  }
}
