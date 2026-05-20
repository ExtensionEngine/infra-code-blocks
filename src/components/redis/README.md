# `src/components/redis`

The Redis module provides `ElastiCacheRedis` for private single-node Redis in an AWSX VPC and `UpstashRedis` for managed global Redis with its password stored in AWS Secrets Manager.

Use these components for caches, session stores, queues, and other low-latency stateful services when you want a consistent Redis backend choice across stacks.

## Usage examples

### Happy path

```ts
import { ElastiCacheRedis, Vpc } from '@studion/infra-code-blocks';

const vpc = new Vpc('app', {});

const cache = new ElastiCacheRedis('app-cache', {
  vpc: vpc.vpc,
});

export const clusterId = cache.cluster.id;
export const clusterAddress = cache.cluster.cacheNodes.apply(
  nodes => nodes[0].address,
);
```

### Non-trivial scenario

```ts
import { UpstashRedis } from '@studion/infra-code-blocks';

const redis = new UpstashRedis('edge-cache', {
  dbName: 'edge-cache',
  primaryRegion: 'eu-west-1',
});

export const databaseId = redis.instance.databaseId;
export const passwordSecretArn = redis.password.secret.arn;
```

## Implementation notes

- `ElastiCacheRedis` merges caller input with defaults of `engineVersion: '7.1'`, `nodeType: 'cache.t4g.micro'`, and `parameterGroupName: 'default.redis7'`.
- `ElastiCacheRedis` always creates a VPC-bound, single-node Redis `aws.elasticache.Cluster` with `numCacheNodes: 1` and port `6379`; it does not create a replication group.
- The ElastiCache subnet group is built from `vpc.isolatedSubnetIds`, and the Redis security group allows TCP/6379 ingress from the VPC CIDR block.
- `ElastiCacheRedis` does not configure transit encryption, auth tokens, automatic failover, replication groups, backups, or multi-AZ failover.
- `UpstashRedis.Args.dbName` is currently required for TypeScript callers. The implementation still computes a fallback database name of `${project}-${stack}` before merging caller input, but callers should provide `dbName` until the public type is relaxed.
- `UpstashRedis` merges internal defaults of `region: 'global'` and `primaryRegion: 'us-east-1'` before creating the database.
- `UpstashRedis` always sets `eviction: true` and `tls: true` on the Upstash database.
- `UpstashRedis` creates a nested `Password` component from `instance.password`, so the Upstash password is copied into AWS Secrets Manager.

## API Reference

### `ElastiCacheRedis`

**Signature**

```ts
class ElastiCacheRedis extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: ElastiCacheRedis.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                    |
| -------------------------------------------- | ---------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.                 |
| `args`\*<br/>`ElastiCacheRedis.Args`         | Direct ElastiCache Redis configuration object. |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options.    |

**Configuration Options**

Direct constructor input: `args: ElastiCacheRedis.Args`

| Property                                                           | Description                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `vpc`\*<br/>`pulumi.Input<awsx.ec2.Vpc>`                           | VPC used for isolated subnets, VPC CIDR ingress, and Redis networking.                |
| `engineVersion`<br/>`string`                                       | Redis engine version passed to the ElastiCache cluster. Default: `'7.1'`.             |
| `nodeType`<br/>`string`                                            | ElastiCache node type for the single Redis node. Default: `'cache.t4g.micro'`.        |
| `parameterGroupName`<br/>`pulumi.Input<string>`                    | ElastiCache parameter group associated with the cluster. Default: `'default.redis7'`. |
| `tags`<br/>`pulumi.Input<{ [key: string]: pulumi.Input<string> }>` | Extra tags merged into the ElastiCache cluster tags.                                  |

**Outputs**

| Property                                        | Description                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `name`<br/>`string`                             | Component name passed to the constructor.                                           |
| `vpc`<br/>`pulumi.Output<awsx.ec2.Vpc>`         | Resolved VPC captured from constructor input for downstream networking composition. |
| `cluster`<br/>`aws.elasticache.Cluster`         | Primary Redis cluster resource.                                                     |
| `securityGroup`<br/>`aws.ec2.SecurityGroup`     | Security group that allows Redis access from the VPC CIDR block.                    |
| `subnetGroup`<br/>`aws.elasticache.SubnetGroup` | Subnet group built from the VPC isolated subnets.                                   |

### `UpstashRedis`

**Signature**

```ts
class UpstashRedis extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: UpstashRedis.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`UpstashRedis.Args`             | Direct Upstash Redis configuration object.  |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: UpstashRedis.Args`

| Property                                                                                                                                                              | Description                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `dbName`\*<br/>`pulumi.Input<string>`                                                                                                                                 | Database name passed to `upstash.RedisDatabase`.                              |
| `primaryRegion`<br/>`pulumi.Input<'us-east-1' \| 'us-west-1' \| 'us-west-2' \| 'eu-central-1' \| 'eu-west-1' \| 'sa-east-1' \| 'ap-southeast-1' \| 'ap-southeast-2'>` | Upstash primary region for the global Redis database. Default: `'us-east-1'`. |

**Outputs**

| Property                               | Description                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `name`<br/>`string`                    | Component name passed to the constructor.                                                   |
| `instance`<br/>`upstash.RedisDatabase` | Primary Upstash Redis database resource with TLS and eviction enabled.                      |
| `password`<br/>`Password`              | Nested password component that stores `instance.password` in AWS Secrets Manager for reuse. |
