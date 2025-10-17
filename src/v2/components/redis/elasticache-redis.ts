import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import { commonTags } from '../../../constants';

type RedisArgs = {
  vpc: pulumi.Input<awsx.ec2.Vpc>;
  /**
   * Version number of the cache engine to be used
   * @default '7.1'
   */
  engineVersion?: string;
  /**
   * Instance type for cache nodes
   * @default 'cache.t4g.micro'
   */
  nodeType?: string;
  /**
   * The name of the parameter group to associate with this cache cluster.
   * @default 'default.redis7'
   */
  parameterGroupName?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

export const defaults = {
  engineVersion: '7.1',
  nodeType: 'cache.t4g.micro',
  parameterGroupName: 'default.redis7',
};

export class ElastiCacheRedis extends pulumi.ComponentResource {
  name: string;
  vpc: pulumi.Output<awsx.ec2.Vpc>;
  cluster: aws.elasticache.Cluster;
  securityGroup: aws.ec2.SecurityGroup;
  subnetGroup: aws.elasticache.SubnetGroup;

  constructor(
    name: string,
    args: RedisArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Redis:ElastiCache', name, {}, opts);
    const argsWithDefaults = Object.assign({}, defaults, args);

    this.name = name;
    this.vpc = pulumi.output(argsWithDefaults.vpc);

    this.securityGroup = this.createSecurityGroup();
    this.subnetGroup = this.createSubnetGroup();
    this.cluster = this.createRedisCluster(
      argsWithDefaults.engineVersion,
      argsWithDefaults.nodeType,
      argsWithDefaults.parameterGroupName,
      argsWithDefaults.tags,
    );

    this.registerOutputs();
  }

  private createRedisCluster(
    engineVersion: RedisArgs['engineVersion'],
    nodeType: RedisArgs['nodeType'],
    parameterGroupName: RedisArgs['parameterGroupName'],
    tags: RedisArgs['tags'],
  ) {
    return new aws.elasticache.Cluster(
      `${this.name}-cluster`,
      {
        engine: 'redis',
        engineVersion: engineVersion,
        nodeType: nodeType,
        numCacheNodes: 1,
        securityGroupIds: [this.securityGroup.id],
        subnetGroupName: this.subnetGroup.name,
        parameterGroupName: parameterGroupName,
        port: 6379,
        tags: { ...commonTags, ...tags },
      },
      { parent: this },
    );
  }

  private createSubnetGroup() {
    return new aws.elasticache.SubnetGroup(
      `${this.name}-subnet-group`,
      {
        subnetIds: this.vpc.isolatedSubnetIds,
        tags: commonTags,
      },
      { parent: this },
    );
  }

  private createSecurityGroup() {
    return new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId: this.vpc.vpcId,
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 6379,
            toPort: 6379,
            cidrBlocks: [this.vpc.vpc.cidrBlock],
          },
        ],
        tags: commonTags,
      },
      { parent: this },
    );
  }
}
