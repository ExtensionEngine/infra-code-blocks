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
import { EcsService, EcsServiceArgs } from './ecs-service';
import { NuxtSSR, NuxtSSRArgs } from './nuxt-ssr';

export type Service =
  | Database
  | Redis
  | StaticSite
  | WebServer
  | NuxtSSR
  | Mongo
  | EcsService;
export type Services = Record<string, Service>;

type ServiceArgs = {
  /**
   * The unique name for the service.
   */
  serviceName: string;
};

export type DatabaseServiceOptions = { type: 'DATABASE' } & ServiceArgs &
  Omit<DatabaseArgs, 'vpcId' | 'vpcCidrBlock' | 'isolatedSubnetIds'>;

export type RedisServiceOptions = { type: 'REDIS' } & ServiceArgs & RedisArgs;

export type StaticSiteServiceOptions = { type: 'STATIC_SITE' } & ServiceArgs &
  StaticSiteArgs;

export type WebServerServiceOptions = {
  type: 'WEB_SERVER';
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
} & ServiceArgs &
  Omit<
    WebServerArgs,
    | 'clusterId'
    | 'clusterName'
    | 'vpcId'
    | 'vpcCidrBlock'
    | 'publicSubnetIds'
    | 'environment'
    | 'secrets'
  >;

export type NuxtSSRServiceOptions = {
  type: 'NUXT_SSR';
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
} & ServiceArgs &
  Omit<
    NuxtSSRArgs,
    | 'clusterId'
    | 'clusterName'
    | 'vpcId'
    | 'vpcCidrBlock'
    | 'publicSubnetIds'
    | 'environment'
    | 'secrets'
  >;

export type MongoServiceOptions = {
  type: 'MONGO';
} & ServiceArgs &
  Omit<
    MongoArgs,
    | 'clusterId'
    | 'clusterName'
    | 'vpcId'
    | 'vpcCidrBlock'
    | 'privateSubnetIds'
    | 'environment'
    | 'secrets'
  >;

export type EcsServiceOptions = {
  type: 'ECS_SERVICE';
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
} & ServiceArgs &
  Omit<
    EcsServiceArgs,
    | 'clusterId'
    | 'clusterName'
    | 'vpcId'
    | 'vpcCidrBlock'
    | 'subnetIds'
    | 'environment'
    | 'secrets'
  >;

export type ProjectArgs = {
  services: (
    | DatabaseServiceOptions
    | RedisServiceOptions
    | StaticSiteServiceOptions
    | WebServerServiceOptions
    | NuxtSSRServiceOptions
    | MongoServiceOptions
    | EcsServiceOptions
  )[];
  enableSSMConnect?: pulumi.Input<boolean>;
  numberOfAvailabilityZones?: number;
};

export class MissingEcsCluster extends Error {
  constructor() {
    super('Ecs Cluster does not exist');
    this.name = this.constructor.name;
  }
}

export class Project extends pulumi.ComponentResource {
  name: string;
  vpc: awsx.ec2.Vpc;
  cluster?: aws.ecs.Cluster;
  upstashProvider?: upstash.Provider;
  ec2SSMConnect?: Ec2SSMConnect;
  services: Services = {};

  constructor(
    name: string,
    args: ProjectArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Project', name, {}, opts);
    this.name = name;

    this.vpc = this.createVpc(args.numberOfAvailabilityZones);
    this.createServices(args.services);

    if (args.enableSSMConnect) {
      this.ec2SSMConnect = new Ec2SSMConnect(`${name}-ssm-connect`, {
        vpcId: this.vpc.vpcId,
        privateSubnetId: this.vpc.privateSubnetIds.apply(ids => ids[0]),
        vpcCidrBlock: this.vpc.vpc.cidrBlock,
      });
    }

    this.registerOutputs();
  }

  private createVpc(
    numberOfAvailabilityZones: ProjectArgs['numberOfAvailabilityZones'] = 2,
  ) {
    const vpc = new awsx.ec2.Vpc(
      `${this.name}-vpc`,
      {
        numberOfAvailabilityZones,
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
      services.some(
        it =>
          it.type === 'WEB_SERVER' ||
          it.type === 'NUXT_SSR' ||
          it.type === 'MONGO' ||
          it.type === 'ECS_SERVICE',
      ) && !this.cluster;
    if (hasRedisService) this.createRedisPrerequisites();
    if (shouldCreateEcsCluster) this.createEcsCluster();
    services.forEach(it => {
      if (it.type === 'DATABASE') this.createDatabaseService(it);
      if (it.type === 'REDIS') this.createRedisService(it);
      if (it.type === 'STATIC_SITE') this.createStaticSiteService(it);
      if (it.type === 'WEB_SERVER') this.createWebServerService(it);
      if (it.type === 'NUXT_SSR') this.createNuxtSSRService(it);
      if (it.type === 'MONGO') this.createMongoService(it);
      if (it.type === 'ECS_SERVICE') this.createEcsService(it);
    });
  }

  private createRedisPrerequisites() {
    const upstashConfig = new pulumi.Config('upstash');

    this.upstashProvider = new upstash.Provider('upstash', {
      email: upstashConfig.requireSecret('email'),
      apiKey: upstashConfig.requireSecret('apiKey'),
    });
  }

  private createEcsCluster() {
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

  private createDatabaseService(options: DatabaseServiceOptions) {
    const { serviceName, type, ...databaseOptions } = options;
    const service = new Database(
      serviceName,
      {
        ...databaseOptions,
        vpcId: this.vpc.vpcId,
        isolatedSubnetIds: this.vpc.isolatedSubnetIds,
        vpcCidrBlock: this.vpc.vpc.cidrBlock,
      },
      { parent: this },
    );
    this.services[serviceName] = service;
  }

  private createRedisService(options: RedisServiceOptions) {
    if (!this.upstashProvider) return;
    const { serviceName, ...redisOptions } = options;
    const service = new Redis(serviceName, redisOptions, {
      parent: this,
      provider: this.upstashProvider,
    });
    this.services[options.serviceName] = service;
  }

  private createStaticSiteService(options: StaticSiteServiceOptions) {
    const { serviceName, ...staticSiteOptions } = options;
    const service = new StaticSite(serviceName, staticSiteOptions, {
      parent: this,
    });
    this.services[serviceName] = service;
  }

  private createWebServerService(options: WebServerServiceOptions) {
    if (!this.cluster) throw new MissingEcsCluster();

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
        clusterId: this.cluster.id,
        clusterName: this.cluster.name,
        vpcId: this.vpc.vpcId,
        vpcCidrBlock: this.vpc.vpc.cidrBlock,
        publicSubnetIds: this.vpc.publicSubnetIds,
        environment: parsedEnv,
        secrets: parsedSecrets,
      },
      { parent: this },
    );
    this.services[options.serviceName] = service;
  }

  private createNuxtSSRService(options: NuxtSSRServiceOptions) {
    if (!this.cluster) throw new MissingEcsCluster();

    const { serviceName, environment, secrets, ...ecsOptions } = options;
    const parsedEnv =
      typeof environment === 'function'
        ? environment(this.services)
        : environment;

    const parsedSecrets =
      typeof secrets === 'function' ? secrets(this.services) : secrets;

    const service = new NuxtSSR(
      serviceName,
      {
        ...ecsOptions,
        clusterId: this.cluster.id,
        clusterName: this.cluster.name,
        vpcId: this.vpc.vpcId,
        vpcCidrBlock: this.vpc.vpc.cidrBlock,
        publicSubnetIds: this.vpc.publicSubnetIds,
        environment: parsedEnv,
        secrets: parsedSecrets,
      },
      { parent: this },
    );
    this.services[options.serviceName] = service;
  }

  private createMongoService(options: MongoServiceOptions) {
    if (!this.cluster) throw new MissingEcsCluster();

    const { serviceName, ...mongoOptions } = options;

    const service = new Mongo(
      serviceName,
      {
        ...mongoOptions,
        clusterId: this.cluster.id,
        clusterName: this.cluster.name,
        vpcId: this.vpc.vpcId,
        vpcCidrBlock: this.vpc.vpc.cidrBlock,
        privateSubnetIds: this.vpc.privateSubnetIds,
      },
      { parent: this },
    );
    this.services[options.serviceName] = service;
  }

  private createEcsService(options: EcsServiceOptions) {
    if (!this.cluster) throw new MissingEcsCluster();

    const { serviceName, environment, secrets, ...ecsOptions } = options;
    const parsedEnv =
      typeof environment === 'function'
        ? environment(this.services)
        : environment;

    const parsedSecrets =
      typeof secrets === 'function' ? secrets(this.services) : secrets;

    const service = new EcsService(
      serviceName,
      {
        ...ecsOptions,
        clusterId: this.cluster.id,
        clusterName: this.cluster.name,
        vpcId: this.vpc.vpcId,
        vpcCidrBlock: this.vpc.vpc.cidrBlock,
        subnetIds: ecsOptions.assignPublicIp
          ? this.vpc.publicSubnetIds
          : this.vpc.privateSubnetIds,
        environment: parsedEnv,
        secrets: parsedSecrets,
      },
      { parent: this },
    );
    this.services[options.serviceName] = service;
  }
}
