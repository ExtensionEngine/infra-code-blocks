import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as upstash from '@upstash/pulumi';
import { Database, DatabaseArgs } from './database';
import { WebServer, WebServerArgs } from './web-server';
import { Mongo, MongoArgs } from './mongo';
import { Redis, RedisArgs } from './redis';
import { StaticSite, StaticSiteArgs } from './static-site';
import { Ec2SSMConnect } from './ec2-ssm-connect';
import { commonTags } from '../constants';

export type Service = Database | Redis | StaticSite | WebServer | Mongo;
export type Services = Record<string, Service>;

type ServiceArgs = {
  /**
   * The unique name for the service.
   */
  serviceName: string;
};

export type DatabaseService = { type: 'DATABASE' } & ServiceArgs &
  Omit<DatabaseArgs, 'vpc'>;

export type RedisService = { type: 'REDIS' } & ServiceArgs &
  Pick<RedisArgs, 'dbName' | 'region'>;

export type StaticSiteService = { type: 'STATIC_SITE' } & ServiceArgs &
  Omit<StaticSiteArgs, 'hostedZoneId'>;

export type WebServerService = {
  type: 'WEB_SERVER';
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
} & ServiceArgs &
  Omit<
    WebServerArgs,
    'cluster' | 'vpc' | 'hostedZoneId' | 'environment' | 'secrets'
  >;

export type MongoService = {
  type: 'MONGO';
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
} & ServiceArgs &
  Omit<MongoArgs, 'cluster' | 'vpc' | 'environment' | 'secrets'>;

export type ProjectArgs = {
  services: (
    | DatabaseService
    | RedisService
    | StaticSiteService
    | WebServerService
    | MongoService
  )[];
  hostedZoneId?: pulumi.Input<string>;
  enableSSMConnect?: pulumi.Input<boolean>;
};

export class MissingHostedZoneId extends Error {
  constructor(serviceType: string) {
    super(
      `Project::hostedZoneId argument must be provided 
      in order to create ${serviceType} service`,
    );
    this.name = this.constructor.name;
  }
}

export class Project extends pulumi.ComponentResource {
  name: string;
  vpc: awsx.ec2.Vpc;
  cluster?: aws.ecs.Cluster;
  hostedZoneId?: pulumi.Input<string>;
  upstashProvider?: upstash.Provider;
  ec2SSMConnect?: Ec2SSMConnect;
  services: Services = {};

  constructor(
    name: string,
    args: ProjectArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Project', name, {}, opts);
    const { services, hostedZoneId } = args;
    this.name = name;
    this.hostedZoneId = hostedZoneId;

    this.vpc = this.createVpc();
    this.createServices(services);

    if (args.enableSSMConnect) {
      this.ec2SSMConnect = new Ec2SSMConnect(`${name}-ssm-connect`, {
        vpc: this.vpc,
      });
    }

    this.registerOutputs();
  }

  private createVpc() {
    const vpc = new awsx.ec2.Vpc(
      `${this.name}-vpc`,
      {
        numberOfAvailabilityZones: 2,
        enableDnsHostnames: true,
        enableDnsSupport: true,
        subnetSpecs: [
          { type: awsx.ec2.SubnetType.Public, cidrMask: 24 },
          { type: awsx.ec2.SubnetType.Private, cidrMask: 24 },
          { type: awsx.ec2.SubnetType.Isolated, cidrMask: 24 },
        ],
        tags: commonTags,
      },
      { parent: this },
    );
    return vpc;
  }

  private createServices(services: ProjectArgs['services']) {
    const hasRedisService = services.some(it => it.type === 'REDIS');
    const shouldCreateEcsCluster =
      services.some(it => it.type === 'WEB_SERVER' || it.type === 'MONGO') &&
      !this.cluster;
    if (hasRedisService) this.createRedisPrerequisites();
    if (shouldCreateEcsCluster) this.createCluster();
    services.forEach(it => {
      if (it.type === 'DATABASE') this.createDatabaseService(it);
      if (it.type === 'REDIS') this.createRedisService(it);
      if (it.type === 'STATIC_SITE') this.createStaticSiteService(it);
      if (it.type === 'WEB_SERVER') this.createWebServerService(it);
      if (it.type === 'MONGO') this.createMongoService(it);
    });
  }

  private createRedisPrerequisites() {
    const upstashConfig = new pulumi.Config('upstash');

    this.upstashProvider = new upstash.Provider('upstash', {
      email: upstashConfig.requireSecret('email'),
      apiKey: upstashConfig.requireSecret('apiKey'),
    });
  }

  private createCluster() {
    const stack = pulumi.getStack();
    this.cluster = new aws.ecs.Cluster(
      `${this.name}-cluster`,
      {
        name: `${this.name}-${stack}`,
        tags: commonTags,
      },
      { parent: this },
    );
  }

  private createDatabaseService(options: DatabaseService) {
    const { serviceName, type, ...databaseOptions } = options;
    const service = new Database(
      serviceName,
      {
        ...databaseOptions,
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
    if (!this.hostedZoneId) throw new MissingHostedZoneId(options.type);
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
    if (!this.hostedZoneId) throw new MissingHostedZoneId(options.type);

    const { serviceName, environment, secrets, ...ecsOptions } = options;
    const parsedEnv =
      typeof environment === 'function'
        ? environment(this.services)
        : environment;

    const parsedSecrets =
      typeof secrets === 'function' ? secrets(this.services) : secrets;

    const service = new WebServer(
      serviceName,
      {
        ...ecsOptions,
        cluster: this.cluster,
        vpc: this.vpc,
        hostedZoneId: this.hostedZoneId,
        environment: parsedEnv,
        secrets: parsedSecrets,
      },
      { parent: this },
    );
    this.services[options.serviceName] = service;
  }

  private createMongoService(options: MongoService) {
    if (!this.cluster) return;

    const { serviceName, environment, secrets, ...ecsOptions } = options;
    const parsedEnv =
      typeof environment === 'function'
        ? environment(this.services)
        : environment;

    const parsedSecrets =
      typeof secrets === 'function' ? secrets(this.services) : secrets;

    const service = new Mongo(
      serviceName,
      {
        ...ecsOptions,
        cluster: this.cluster,
        vpc: this.vpc,
        environment: parsedEnv,
        secrets: parsedSecrets,
      },
      { parent: this },
    );
    this.services[options.serviceName] = service;
  }
}
