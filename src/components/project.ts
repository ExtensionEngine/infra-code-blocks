import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as upstash from '@upstash/pulumi';
import { Rds, RdsArgs } from './rds';
import { EcsService, EcsServiceArgs } from './ecs';
import { Redis, RedisArgs } from './redis';
import { Environment } from '../constants';

export type Service = Rds | Redis | EcsService;
export type Services = Record<string, Service>;

type ServiceArgs = { serviceName: string };

export type DatabaseService = {
  type: 'DATABASE';
} & ServiceArgs &
  Pick<
    RdsArgs,
    | 'dbName'
    | 'username'
    | 'password'
    | 'allocatedStorage'
    | 'maxAllocatedStorage'
    | 'instanceClass'
    | 'applyImmediately'
  >;

export type RedisService = {
  type: 'REDIS';
} & ServiceArgs &
  Pick<RedisArgs, 'dbName' | 'region'>;

export type WebServerService = {
  type: 'WEB_SERVER';
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  healtCheckPath?: pulumi.Input<string>;
} & ServiceArgs &
  Pick<
    EcsServiceArgs,
    'image' | 'port' | 'desiredCount' | 'minCount' | 'maxCount' | 'size'
  >;

export type Environment = (typeof Environment)[keyof typeof Environment];

export type ProjectArgs = {
  services: (DatabaseService | RedisService | WebServerService)[];
  environment: Environment;
};

export class Project extends pulumi.ComponentResource {
  name: string;
  environment: Environment;
  vpc: awsx.ec2.Vpc;
  dbSubnetGroup: aws.rds.SubnetGroup | null = null;
  dbSecurityGroup: aws.ec2.SecurityGroup | null = null;
  cluster: aws.ecs.Cluster | null = null;
  lbSecurityGroup: aws.ec2.SecurityGroup | null = null;
  lb: aws.lb.LoadBalancer | null = null;
  ecsServiceSecurityGroup: aws.ec2.SecurityGroup | null = null;
  upstashProvider: upstash.Provider | null = null;
  services: Services = {};

  constructor(
    name: string,
    args: ProjectArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Project', name, {}, opts);
    const { services, environment } = args;
    this.name = name;
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
    const hasDatabaseService = services.some(it => it.type === 'DATABASE');
    const hasRedisService = services.some(it => it.type === 'REDIS');
    const hasWebServerService = services.some(it => it.type === 'WEB_SERVER');
    if (hasDatabaseService) this.createDatabasePrerequisites();
    if (hasRedisService) this.createRedisPrerequisites();
    if (hasWebServerService) this.createWebServerPrerequisites();
    services.forEach(it => {
      if (it.type === 'DATABASE') this.createDatabaseService(it);
      if (it.type === 'REDIS') this.createRedisService(it);
      if (it.type === 'WEB_SERVER') this.createWebServerService(it);
    });
  }

  private createDatabasePrerequisites() {
    this.dbSubnetGroup = new aws.rds.SubnetGroup(
      'db-subnet-group',
      {
        subnetIds: this.vpc.privateSubnetIds,
      },
      { parent: this },
    );
    this.dbSecurityGroup = new aws.ec2.SecurityGroup(
      'db-security-group',
      {
        vpcId: this.vpc.vpcId,
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 5432,
            toPort: 5432,
            cidrBlocks: [this.vpc.vpc.cidrBlock],
          },
        ],
      },
      { parent: this },
    );
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
    this.lbSecurityGroup = new aws.ec2.SecurityGroup(
      'ecs-lb-security-group',
      {
        vpcId: this.vpc.vpcId,
        ingress: [
          {
            fromPort: 80,
            toPort: 80,
            protocol: 'tcp',
            cidrBlocks: ['0.0.0.0/0'],
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
      },
      { parent: this },
    );
    this.lb = new aws.lb.LoadBalancer(
      'ecs-load-balancer',
      {
        loadBalancerType: 'application',
        subnets: this.vpc.publicSubnetIds,
        securityGroups: [this.lbSecurityGroup.id],
        internal: false,
        ipAddressType: 'ipv4',
      },
      { parent: this },
    );
    this.ecsServiceSecurityGroup = new aws.ec2.SecurityGroup(
      'ecs-service-security-group',
      {
        vpcId: this.vpc.vpcId,
        ingress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: '-1',
            securityGroups: [this.lbSecurityGroup.id],
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
      },
      { parent: this },
    );
  }

  private createDatabaseService(options: DatabaseService) {
    if (!this.dbSecurityGroup || !this.dbSubnetGroup) return;
    const { serviceName, type, ...rdsOptions } = options;
    const instance = new Rds(
      serviceName,
      {
        ...rdsOptions,
        subnetGroupName: this.dbSubnetGroup.name,
        securityGroupIds: [this.dbSecurityGroup.id],
      },
      { parent: this },
    );
    this.services[serviceName] = instance;
  }

  private createRedisService(options: RedisService) {
    if (!this.upstashProvider) return;
    const { serviceName, ...redisOptions } = options;
    const instance = new Redis(serviceName, redisOptions, {
      parent: this,
      provider: this.upstashProvider,
    });
    this.services[options.serviceName] = instance;
  }

  private createWebServerService(options: WebServerService) {
    if (!this.cluster || !this.ecsServiceSecurityGroup || !this.lb) {
      return;
    }
    const {
      serviceName,
      environment,
      healtCheckPath = '/healtcheck',
      ...ecsOptions
    } = options;

    const lbTargetGroup = new aws.lb.TargetGroup(
      `${serviceName}-tg`,
      {
        port: ecsOptions.port,
        protocol: 'HTTP',
        targetType: 'ip',
        vpcId: this.vpc.vpcId,
        healthCheck: {
          healthyThreshold: 3,
          unhealthyThreshold: 2,
          interval: 60,
          timeout: 5,
          path: healtCheckPath,
        },
      },
      { parent: this, dependsOn: [this.lb] },
    );
    const lbListener = new aws.lb.Listener(
      `${serviceName}-lb-listener`,
      {
        loadBalancerArn: this.lb.arn,
        port: 80,
        defaultActions: [
          {
            type: 'forward',
            targetGroupArn: lbTargetGroup.arn,
          },
        ],
      },
      { parent: this, dependsOn: [this.lb, lbTargetGroup] },
    );

    const parsedEnv =
      typeof environment === 'function'
        ? environment(this.services)
        : environment;

    const instance = new EcsService(
      serviceName,
      {
        ...ecsOptions,
        cluster: this.cluster,
        subnets: this.vpc.publicSubnetIds,
        securityGroupIds: [this.ecsServiceSecurityGroup.id],
        lb: this.lb,
        lbTargetGroup,
        lbListener,
        environment: parsedEnv,
      },
      { parent: this },
    );
    this.services[options.serviceName] = instance;
  }
}
