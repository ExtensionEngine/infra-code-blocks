import * as aws from '@pulumi/aws-v7';
import * as pulumi from '@pulumi/pulumi';
import * as upstash from '@upstash/pulumi';
import { next as studion } from '@studion/infra-code-blocks';

const appName = 'redis-test';
const stackName = pulumi.getStack();
const tags = {
  Project: appName,
  Environment: stackName,
};

const parent = new pulumi.ComponentResource(
  'studion:elasticache:TestGroup',
  `${appName}-root`,
);

const vpc = new studion.Vpc(`${appName}-vpc`, {}, { parent });

const defaultElastiCacheRedis = new studion.ElastiCacheRedis(
  `${appName}-default-elasticache`,
  { vpc: vpc.vpc },
  { parent },
);

const elastiCacheRedis = new studion.ElastiCacheRedis(
  `${appName}-elasticache`,
  {
    vpc: vpc.vpc,
    engineVersion: '6.x',
    nodeType: 'cache.t4g.micro',
    parameterGroupName: 'default.redis6.x',
    tags,
  },
  { parent },
);

const cluster = new aws.ecs.Cluster(
  `${appName}-cluster`,
  {
    name: `${appName}-cluster-${stackName}`,
    tags,
  },
  { parent },
);

const testClientContainer = {
  name: `${appName}-ec-container`,
  image:
    'redis:8.2.2-alpine@sha256:59b6e694653476de2c992937ebe1c64182af4728e54bb49e9b7a6c26614d8933',
  environment: [
    {
      name: 'REDIS_HOST',
      value: pulumi
        .output(defaultElastiCacheRedis.cluster.cacheNodes)
        .apply(nodes => nodes[0].address),
    },
    {
      name: 'REDIS_PORT',
      value: pulumi
        .output(defaultElastiCacheRedis.cluster.port)
        .apply(port => port.toString()),
    },
    { name: 'MAX_ATTEMPTS', value: '30' },
    { name: 'RETRY_INTERVAL', value: '5' },
    { name: 'CONNECTION_TIMEOUT', value: '10' },
  ],
  command: [
    'sh',
    '-c',
    `
    # Enable command tracing for debugging
    set -x

    echo "Target Redis: $REDIS_HOST:$REDIS_PORT"

    # Initial connection wait loop
    echo 'Waiting for Redis to be ready...'
    for attempt in $(seq 1 $MAX_ATTEMPTS); do
      echo "Connection attempt $attempt of $MAX_ATTEMPTS..."
      if timeout $CONNECTION_TIMEOUT redis-cli -h $REDIS_HOST -p $REDIS_PORT ping >/dev/null 2>&1; then
        echo "SUCCESS: Redis ping was successful"
        break
      else
        echo "Redis not ready yet..."
        if [ $attempt -lt $MAX_ATTEMPTS ]; then
          echo "Waiting $RETRY_INTERVAL seconds before next attempt..."
          sleep $RETRY_INTERVAL
        else
          echo "ERROR: Maximum attempts ($MAX_ATTEMPTS) reached. Redis is not available."
          exit 1
        fi
      fi
    done

    while true; do
      echo 'Test client container is running. Logs can be inspected.'
      sleep 30
    done
    `,
  ],
  essential: true,
};

const testClient = new studion.EcsService(
  `${appName}-ec-client`,
  {
    cluster,
    vpc: vpc.vpc,
    containers: [testClientContainer],
    assignPublicIp: false,
  },
  { parent },
);

const upstashRedis = new studion.UpstashRedis(
  `${appName}-upstash`,
  {
    dbName: `${appName}-upstash`,
  },
  { parent },
);

export {
  vpc,
  defaultElastiCacheRedis,
  elastiCacheRedis,
  cluster,
  testClient,
  upstashRedis,
};
