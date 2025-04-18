# `@studion/infra-code-blocks`

Studion Platform common infra components.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Usage](#usage)
4. [API](#api)

## Prerequisites

- Working [Pulumi](https://www.pulumi.com/docs/clouds/aws/get-started/begin/#pulumi-aws-before-you-begin) project
- AWS account with necessary permissions for each Studion component

## Installation

- Run the command:

```bash
$ npm i @studion/infra-code-blocks
```

## Usage

- Import Studion infra components in your project

```ts
import * as studion from '@studion/infra-code-blocks';
```

- Use Studion components

```ts
import * as studion from '@studion/infra-code-blocks';

const project = new studion.Project('demo-project', {
  services: [
    {
      type: 'REDIS',
      serviceName: 'redis',
      dbName: 'test-db',
    },
  ],
});

export const projectName = project.name;
```

- Deploy Pulumi stack

```bash
$ pulumi up
```

## API

1. [Project](#project)
2. [Database](#database)
3. [Database Replica](#database-replica)
4. [Redis](#redis)
5. [StaticSite](#static-site)
6. [WebServer](#web-server)
7. [Nuxt SSR](#nuxt-ssr-preset)
8. [Mongo](#mongo)
9. [EcsService](#ecs-service)

### Project

Project component makes it easy to spin up project infrastructure,
hiding infrastructure complexity.
<br>
The component creates its own VPC used for resources within the project.
<br><br>
Services are created only if specified in the `services` list.
<br>
If `services` is an empty list, VPC is the only service created by default.

```ts
new Project(name: string, args: ProjectArgs, opts?: pulumi.CustomResourceOptions);
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
type ProjectArgs = {
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
```

| Argument         |                                                                         Description                                                                          |
| :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------: |
| services \*      |                                                                        Service list.                                                                         |
| enableSSMConnect | Set up ec2 instance and SSM in order to connect to the database in the private subnet. Please refer to the [SSM Connect](#ssm-connect) section for more info. |
| numberOfAvailabilityZones | Default is 2 which is recommended. If building a dev server, we can reduce to 1 availability zone to reduce hosting cost. |

```ts
type DatabaseServiceOptions = {
  type: 'DATABASE';
  serviceName: string;
  dbName: pulumi.Input<string>;
  username: pulumi.Input<string>;
  password?: pulumi.Input<string>;
  multiAz?: pulumi.Input<boolean>;
  applyImmediately?: pulumi.Input<boolean>;
  skipFinalSnapshot?: pulumi.Input<boolean>;
  allocatedStorage?: pulumi.Input<number>;
  maxAllocatedStorage?: pulumi.Input<number>;
  instanceClass?: pulumi.Input<string>;
  enableMonitoring?: pulumi.Input<boolean>;
  parameterGroupName?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

```ts
export type RedisServiceOptions = {
  type: 'REDIS';
  serviceName: string;
  dbName: pulumi.Input<string>;
  region?: pulumi.Input<string>;
};
```

```ts
export type StaticSiteServiceOptions = {
  type: 'STATIC_SITE';
  serviceName: string;
  domain?: pulumi.Input<string>;
  hostedZoneId?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

```ts
export type WebServerServiceOptions = {
  type: 'WEB_SERVER';
  serviceName: string;
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  domain?: pulumi.Input<string>;
  hostedZoneId?: pulumi.Input<string>;
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
  desiredCount?: pulumi.Input<number>;
  autoscaling?: pulumi.Input<{
    enabled: pulumi.Input<boolean>;
    minCount?: pulumi.Input<number>;
    maxCount?: pulumi.Input<number>;
  }>;
  size?: pulumi.Input<Size>;
  healthCheckPath?: pulumi.Input<string>;
  persistentStorageConfig?: pulumi.Input<{
    volumes: { name: string }[];
    mountPoints: {
      sourceVolume: string;
      containerPath: string;
      readOnly?: boolean;
    }[];
  }>;
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

```ts
export type NuxtSSRServiceOptions = {
  type: 'NUXT_SSR';
  serviceName: string;
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  domain?: pulumi.Input<string>;
  hostedZoneId?: pulumi.Input<string>;
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
  desiredCount?: pulumi.Input<number>;
  autoscaling?: pulumi.Input<{
    enabled: pulumi.Input<boolean>;
    minCount?: pulumi.Input<number>;
    maxCount?: pulumi.Input<number>;
  }>;
  size?: pulumi.Input<Size>;
  healthCheckPath?: pulumi.Input<string>;
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

```ts
type MongoServiceOptions = {
  type: 'MONGO';
  serviceName: string;
  username: pulumi.Input<string>;
  password?: pulumi.Input<string>;
  port?: pulumi.Input<number>;
  size?: pulumi.Input<Size>;
  persistentStorageConfig?: pulumi.Input<{
    volumes: { name: string }[];
    mountPoints: {
      sourceVolume: string;
      containerPath: string;
      readOnly?: boolean;
    }[];
  }>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

```ts
type EcsServiceOptions = {
  type: 'ECS_SERVICE';
  serviceName: string;
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  enableServiceAutoDiscovery: pulumi.Input<boolean>;
  lbTargetGroupArn?: aws.lb.TargetGroup['arn'];
  persistentStorageConfig?: pulumi.Input<{
    volumes: { name: string }[];
    mountPoints: {
      sourceVolume: string;
      containerPath: string;
      readOnly?: boolean;
    }[];
  }>;
  securityGroup?: aws.ec2.SecurityGroup;
  assignPublicIp?: pulumi.Input<boolean>;
  dockerCommand?: pulumi.Input<string[]>;
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
  desiredCount?: pulumi.Input<number>;
  autoscaling?: pulumi.Input<{
    enabled: pulumi.Input<boolean>;
    minCount?: pulumi.Input<number>;
    maxCount?: pulumi.Input<number>;
  }>;
  size?: pulumi.Input<Size>;
  healthCheckPath?: pulumi.Input<string>;
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

Often, web server depends on other services such as database, Redis, etc.
For that purpose, environment factory can be used. The factory function
receives services bag as argument.

```ts
const project = new studion.Project('demo-project', {
  services: [
    {
      type: 'REDIS',
      serviceName: 'redis',
      dbName: 'test-db',
    },
    {
      type: 'WEB_SERVER',
      serviceName: 'api',
      image: imageUri,
      port: 3000,
      domain: 'api.my-domain.com',
      hostedZoneId: 'my-domain.com-hostedZoneId',
      environment: (services: Services) => {
        const redisServiceName = 'redis';
        const redis = services[redisServiceName];
        return [
          { name: 'REDIS_HOST', value: redis.endpoint },
          { name: 'REDIS_PORT', value: redis.port.apply(port => String(port)) },
        ];
      },
    },
  ],
});
```

In order to pass sensitive information to the container, use `secrets` instead of `environment`. AWS will fetch values from
Secret Manager based on arn that is provided for the `valueFrom` field.

```ts
const project = new studion.Project('demo-project', {
  services: [
    {
      type: 'WEB_SERVER',
      serviceName: 'api',
      image: imageUri,
      port: 3000,
      domain: 'api.my-domain.com',
      hostedZoneId: 'my-domain.com-hostedZoneId',
      secrets: [
        { name: 'DB_PASSWORD', valueFrom: 'arn-of-the-secret-manager-secret' },
      ],
    },
  ],
});
```

```ts
const project = new studion.Project('demo-project', {
  services: [
    {
      type: 'REDIS',
      serviceName: 'redis',
      dbName: 'test-db',
    },
    {
      type: 'WEB_SERVER',
      serviceName: 'api',
      image: imageUri,
      port: 3000,
      domain: 'api.my-domain.com',
      hostedZoneId: 'my-domain.com-hostedZoneId',
      secrets: (services: Services) => {
        const redisServiceName = 'redis';
        const redis = services[redisServiceName];
        return [
          { name: 'REDIS_PASSWORD', valueFrom: redis.passwordSecret.arn },
        ];
      },
    },
  ],
});
```

### Persistent Storage Configuration

Services that require persistent storage (e.g. `ECS`, `Mongo`) can be configured with multiple EFS volumes and mount points.
Currently, only one access point is configured, with root directory set to `/data`.
The configuration consists of two main parts:

1. `volumes`: Define the EFS volumes to be created
2. `mountPoints`: Specify where these volumes should be mounted in the container

Example configuration:

```ts
persistentStorageConfig: {
  volumes: [
    { name: 'data-volume' },
    { name: 'config-volume' }
  ],
  mountPoints: [
    {
      sourceVolume: 'data-volume',
      containerPath: '/data',
    },
    {
      sourceVolume: 'config-volume',
      containerPath: '/config',
      readOnly: true
    }
  ]
}
```

### Database

AWS RDS Postgres instance.

Features:

- enabled encryption with a symmetric encryption key
- deployed inside an isolated subnet
- backup enabled with retention period set to 14 days

<br>

```ts
new Database(name: string, args: DatabaseArgs, opts?: pulumi.CustomResourceOptions);
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
type DatabaseArgs = {
  dbName: pulumi.Input<string>;
  username: pulumi.Input<string>;
  vpcId: pulumi.Input<string>;
  isolatedSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  vpcCidrBlock: pulumi.Input<string>;
  password?: pulumi.Input<string>;
  multiAz?: pulumi.Input<boolean>;
  applyImmediately?: pulumi.Input<boolean>;
  skipFinalSnapshot?: pulumi.Input<boolean>;
  allocatedStorage?: pulumi.Input<number>;
  maxAllocatedStorage?: pulumi.Input<number>;
  instanceClass?: pulumi.Input<string>;
  enableMonitoring?: pulumi.Input<boolean>;
  parameterGroupName?: pulumi.Input<string>;
  engineVersion?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

If the password is not specified, it will be autogenerated.
The database password is stored as a secret inside AWS Secret Manager.
The secret will be available on the `Database` resource as `password.secret`.

### Database Replica

AWS RDS Postgres instance.

Features:

- enabled encryption with a symmetric encryption key
- deployed inside an isolated subnet

<br>

```ts
new DatabaseReplica(name: string, args: DatabaseReplicaArgs, opts?: pulumi.CustomResourceOptions);
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
type DatabaseReplicaArgs = {
  replicateSourceDb: pulumi.Input<string>;
  dbSecurityGroupId: pulumi.Input<string>;
  dbSubnetGroupName?: pulumi.Input<string>;
  monitoringRole?: aws.iam.Role;
  multiAz?: pulumi.Input<boolean>;
  applyImmediately?: pulumi.Input<boolean>;
  allocatedStorage?: pulumi.Input<number>;
  maxAllocatedStorage?: pulumi.Input<number>;
  instanceClass?: pulumi.Input<string>;
  parameterGroupName?: pulumi.Input<string>;
  engineVersion?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```
Database replica requires primary DB instance to exist. If the replica is in the same
region as primary instance, we should not set `dbSubnetGroupNameParam`.
The `replicateSourceDb` param is referenced like this:
```javascript
  const primaryDb = new studion.Database(...);
  const replica = new studion.DatabaseReplica('replica', {
    replicateSourceDb: primaryDb.instance.identifier
  });
```

### Redis

[Upstash](https://upstash.com) Redis instance.

**Prerequisites**

1. Stack Config

| Name              |     Description     | Secret |
| :---------------- | :-----------------: | :----: |
| upstash:email \*  | Upstash user email. |  true  |
| upstash:apiKey \* |  Upstash API key.   |  true  |

```bash
$ pulumi config set --secret upstash:email myemail@example.com
$ pulumi config set --secret upstash:apiKey my-api-key
```

<br>

```ts
new Redis(name: string, args: RedisArgs, opts: RedisOptions);
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
type RedisArgs = {
  dbName: pulumi.Input<string>;
  region?: pulumi.Input<string>;
};

interface RedisOptions extends pulumi.ComponentResourceOptions {
  provider: upstash.Provider;
}
```

After creating the Redis resource, the `passwordSecret` AWS Secret Manager Secret
will exist on the resource.

### Static Site

AWS S3 + Cloudfront.

Features:

- creates TLS certificate for the specified domain
- redirects HTTP traffic to HTTPS
- enables http2 and http3 protocols
- uses North America and Europe edge locations

<br>

```ts
new StaticSite(name: string, args: StaticSiteArgs, opts?: pulumi.ComponentResourceOptions );
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
type StaticSiteArgs = {
  domain?: pulumi.Input<string>;
  hostedZoneId?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

### Web Server

AWS ECS Fargate.

Features:

- memory and CPU autoscaling enabled
- creates TLS certificate for the specified domain
- redirects HTTP traffic to HTTPS
- creates CloudWatch log group
- comes with predefined CPU and memory options: `small`, `medium`, `large`, `xlarge`

<br>

```ts
new WebServer(name: string, args: WebServerArgs, opts?: pulumi.ComponentResourceOptions );
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
export type WebServerArgs = {
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  clusterId: pulumi.Input<string>;
  clusterName: pulumi.Input<string>;
  vpcId: pulumi.Input<string>;
  vpcCidrBlock: pulumi.Input<string>;
  publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  domain?: pulumi.Input<string>;
  hostedZoneId?: pulumi.Input<string>;
  desiredCount?: pulumi.Input<number>;
  autoscaling?: pulumi.Input<{
    enabled: pulumi.Input<boolean>;
    minCount?: pulumi.Input<number>;
    maxCount?: pulumi.Input<number>;
  }>;
  size?: pulumi.Input<Size>;
  environment?: aws.ecs.KeyValuePair[];
  secrets?: aws.ecs.Secret[];
  healthCheckPath?: pulumi.Input<string>;
  persistentStorageConfig?: pulumi.Input<{
    volumes: { name: string }[];
    mountPoints: {
      sourceVolume: string;
      containerPath: string;
      readOnly?: boolean;
    }[];
  }>;
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

### Nuxt SSR preset

AWS ECS Fargate + Cloudfront.

Features:

- memory and CPU autoscaling enabled
- creates TLS certificate for the specified domain
- redirects HTTP traffic to HTTPS
- creates CloudWatch log group
- comes with predefined CPU and memory options: `small`, `medium`, `large`, `xlarge`
- CDN in front of the application load balancer for static resource caching

<br>

```ts
new NuxtSSR(name: string, args: NuxtSSRArgs, opts?: pulumi.ComponentResourceOptions );
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
export type NuxtSSRArgs = {
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  clusterId: pulumi.Input<string>;
  clusterName: pulumi.Input<string>;
  vpcId: pulumi.Input<string>;
  vpcCidrBlock: pulumi.Input<string>;
  publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  domain?: pulumi.Input<string>;
  hostedZoneId?: pulumi.Input<string>;
  desiredCount?: pulumi.Input<number>;
  autoscaling?: pulumi.Input<{
    enabled: pulumi.Input<boolean>;
    minCount?: pulumi.Input<number>;
    maxCount?: pulumi.Input<number>;
  }>;
  size?: pulumi.Input<Size>;
  environment?: aws.ecs.KeyValuePair[];
  secrets?: aws.ecs.Secret[];
  healthCheckPath?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

### Mongo

AWS ECS Fargate.

Features:

- persistent storage
- service auto-discovery
- creates CloudWatch log group
- comes with predefined CPU and memory options: `small`, `medium`, `large`, `xlarge`

<br>

```ts
new Mongo(name: string, args: MongoArgs, opts?: pulumi.ComponentResourceOptions );
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
export type MongoArgs = {
  clusterId: pulumi.Input<string>;
  clusterName: pulumi.Input<string>;
  vpcId: pulumi.Input<string>;
  vpcCidrBlock: pulumi.Input<string>;
  privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  username: pulumi.Input<string>;
  password?: pulumi.Input<string>;
  port?: pulumi.Input<number>;
  size?: pulumi.Input<Size>;
  persistentStorageConfig?: pulumi.Input<{
    volumes: { name: string }[];
    mountPoints: {
      sourceVolume: string;
      containerPath: string;
      readOnly?: boolean;
    }[];
  }>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

If the password is not specified it will be autogenerated.
The Mongo password is stored as a secret inside AWS Secret Manager.
The secret will be available on the `Mongo` resource as `password.secret`.

The Mongo component comes with a default persistent storage configuration that mounts an EFS volume `mongo` to `/data/db`. You can override this by providing your own `persistentStorageConfig`.

### Ecs Service

AWS ECS Fargate.

Features:

- memory and CPU autoscaling
- service auto-discovery
- persistent storage
- CloudWatch logs
- comes with predefined cpu and memory options: `small`, `medium`, `large`, `xlarge`

<br>

```ts
new EcsService(name: string, args: EcsServiceArgs, opts?: pulumi.ComponentResourceOptions );
```

| Argument |                  Description                   |
| :------- | :--------------------------------------------: |
| name \*  |        The unique name of the resource.        |
| args \*  |     The arguments to resource properties.      |
| opts     | Bag of options to control resource's behavior. |

```ts
export type EcsServiceArgs = {
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  clusterId: pulumi.Input<string>;
  clusterName: pulumi.Input<string>;
  vpcId: pulumi.Input<string>;
  vpcCidrBlock: pulumi.Input<string>;
  subnetIds: pulumi.Input<pulumi.Input<string>[]>;
  desiredCount?: pulumi.Input<number>;
  autoscaling?: pulumi.Input<{
    enabled: pulumi.Input<boolean>;
    minCount?: pulumi.Input<number>;
    maxCount?: pulumi.Input<number>;
  }>;
  size?: pulumi.Input<Size>;
  environment?: aws.ecs.KeyValuePair[];
  secrets?: aws.ecs.Secret[];
  enableServiceAutoDiscovery: pulumi.Input<boolean>;
  persistentStorageConfig?: pulumi.Input<{
    volumes: { name: string }[];
    mountPoints: {
      sourceVolume: string;
      containerPath: string;
      readOnly?: boolean;
    }[];
  }>;
  dockerCommand?: pulumi.Input<string[]>;
  lbTargetGroupArn?: aws.lb.TargetGroup['arn'];
  securityGroup?: aws.ec2.SecurityGroup;
  assignPublicIp?: pulumi.Input<boolean>;
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

#### Exec into running ECS task

**Prerequisites**

1. Install the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/install-plugin-macos-overview.html#install-plugin-macos)

```bash
$ brew install --cask session-manager-plugin
```

2. Install jq

```bash
$ brew install jq
```

In order to exec into running ECS container run the following command:

```bash
aws ecs execute-command  \
  --cluster CLUSTER_NAME \
  --task $(aws ecs list-tasks --cluster CLUSTER_NAME --family TASK_FAMILY_NAME | jq -r '.taskArns[0] | split("/")[2]') \
  --command "/bin/sh" \
  --interactive
```

Where `CLUSTER_NAME` is the name of the ECS cluster and `TASK_FAMILY_NAME` is the name of the task family that task belongs to.

## SSM Connect

The [Database](#database) component deploys a database instance inside an isolated subnet,
and it's not publicly accessible from outside of VPC.
<br>
In order to connect to the database we need to deploy the ec2 instance which will be used
to forward traffic to the database instance.
<br>
Because of security reasons, the ec2 instance is deployed inside a private subnet
which means we can't directly connect to it. For that purpose, we use AWS System Manager
which enables us to connect to the ec2 instance even though it's inside a private subnet.
Another benefit of using AWS SSM is that we don't need a ssh key pair.

![AWS RDS connection schema](/assets/images/ssm-rds.png)

**Prerequisites**

1. Install the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/install-plugin-macos-overview.html#install-plugin-macos)

```bash
$ brew install --cask session-manager-plugin
```

SSM Connect can be enabled by setting `enableSSMConnect` property to `true`.

```ts
const project = new studion.Project('demo-project', {
  enableSSMConnect: true,
  ...
});

export const ec2InstanceId = project.ec2SSMConnect?.ec2.id;
```

Open up your terminal and run the following command:

```bash
$ aws ssm start-session --target EC2_INSTANCE_ID --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{"host": ["DATABASE_ADDRESS"], "portNumber":["DATABASE_PORT"], "localPortNumber":["5555"]}'
```

Where `EC2_INSTANCE_ID` is an ID of the EC2 instance that is created for you
(ID can be obtained by exporting it from the stack), and
`DATABASE_ADDRESS` and `DATABASE_PORT` are the address and port of the
database instance.

And that is it! 🥳
Now you can use your favorite database client to connect to the database.

![RDS connection](/assets/images/rds-connection.png)

It is important that for the host you set `localhost` and for the port you set `5555`
because we are port-forwarding traffic from
localhost:5555 to DATABASE_ADDRESS:DATABASE_PORT.
For the user, password, and database field, set values which are set in the `Project`.

```ts
const project = new studion.Project('demo-project', {
  enableSSMConnect: true,
  services: [
    {
      type: 'DATABASE',
      dbName: 'database_name',
      username: 'username',
      password: 'password',
      ...
    }
  ]
});
```

## 🚧 TODO

- [ ] Add worker service for executing tasks
- [ ] Enable RDS password rotation
