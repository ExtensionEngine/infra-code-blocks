# `@studion/infra-code-blocks`

Studion Platform common infra components.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Usage](#usage)
4. [API](#api)

## Prerequisites

- Working [Pulumi](https://www.pulumi.com/docs/clouds/aws/get-started/begin/#pulumi-aws-before-you-begin) project
- AWS account with neccessary permissions for each studion component

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

- Deploy pulumi stack

```bash
$ pulumi up
```

## API

1. [Project](#project)
2. [Database](#database)
3. [Redis](#redis)
4. [StaticSite](#static-site)
5. [WebServer](#web-server)

### Project

Project component makes it really easy to spin up project infrastructure,
hiding infrastructure complexity.
<br>
The component creates its own VPC which is used for resources within the project.

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
    | DatabaseService
    | RedisService
    | StaticSiteService
    | WebServerService
    | MongoService
  )[];
  hostedZoneId?: pulumi.Input<string>;
  enableSSMConnect?: pulumi.Input<boolean>;
};
```

| Argument         |                                                                         Description                                                                          |
| :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------: |
| services \*      |                                                                        Service list.                                                                         |
| hostedZoneId     |                     Route53 hosted zone ID responsible for managing records for the domain. Required for 'STATIC_SITE' and 'WEB_SERVER'                      |
| enableSSMConnect | Setup ec2 instance and SSM in order to connect to the database in the private subnet. Please refer to the [SSM Connect](#ssm-connect) section for more info. |

```ts
type DatabaseService = {
  type: 'DATABASE';
  serviceName: string;
  dbName: pulumi.Input<string>;
  username: pulumi.Input<string>;
  password: pulumi.Input<string>;
  applyImmediately?: pulumi.Input<boolean>;
  skipFinalSnapshot?: pulumi.Input<boolean>;
  allocatedStorage?: pulumi.Input<number>;
  maxAllocatedStorage?: pulumi.Input<number>;
  instanceClass?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

```ts
type MongoService = {
  type: 'MONGO';
  serviceName: string;
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
  port?: pulumi.Input<number>;
  size?: pulumi.Input<Size>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

```ts
export type RedisService = {
  type: 'REDIS';
  serviceName: string;
  dbName: pulumi.Input<string>;
  region?: pulumi.Input<string>;
};
```

```ts
export type StaticSiteService = {
  type: 'STATIC_SITE';
  serviceName: string;
  domain: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

```ts
export type WebServerService = {
  type: 'WEB_SERVER';
  serviceName: string;
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  domain: pulumi.Input<string>;
  desiredCount?: pulumi.Input<number>;
  minCount?: pulumi.Input<number>;
  maxCount?: pulumi.Input<number>;
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
recieves services bag as argument.

```ts
const project = new studion.Project('demo-project', {
  environment: 'DEVELOPMENT',
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

In order to pass sensitive information to the container use `secrets` instead of `environment`. AWS will fetch values from
Secret Manager based on arn that is provided for the `valueFrom` field.

```ts
const project = new studion.Project('demo-project', {
  environment: 'DEVELOPMENT',
  services: [
    {
      type: 'WEB_SERVER',
      serviceName: 'api',
      image: imageUri,
      port: 3000,
      domain: 'api.my-domain.com',
      secrets: [
        { name: 'DB_PASSWORD', valueFrom: 'arn-of-the-secret-manager-secret' },
      ],
    },
  ],
});
```

```ts
const project = new studion.Project('demo-project', {
  environment: 'DEVELOPMENT',
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
  password: pulumi.Input<string>;
  vpc: awsx.ec2.Vpc;
  applyImmediately?: pulumi.Input<boolean>;
  skipFinalSnapshot?: pulumi.Input<boolean>;
  allocatedStorage?: pulumi.Input<number>;
  maxAllocatedStorage?: pulumi.Input<number>;
  instanceClass?: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

The database password is stored as a secret inside AWS Secret Manager.
The secret will be available on the `Database` resource as `passwordSecret`.

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

AWS S3 + Cloudfront static site.

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
  domain: pulumi.Input<string>;
  hostedZoneId: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};
```

### Web Server

AWS ECS Fargate web server.

Features:

- Memory and CPU autoscaling enabled
- creates TLS certificate for the specified domain
- redirects HTTP traffic to HTTPS
- creates CloudWatch log group
- comes with predefined cpu and memory options: `small`, `medium`, `large`, `xlarge`

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
  domain: pulumi.Input<string>;
  cluster: aws.ecs.Cluster;
  hostedZoneId: pulumi.Input<string>;
  vpc: awsx.ec2.Vpc;
  desiredCount?: pulumi.Input<number>;
  minCount?: pulumi.Input<number>;
  maxCount?: pulumi.Input<number>;
  size?: pulumi.Input<Size>;
  environment?: aws.ecs.KeyValuePair[];
  secrets?: aws.ecs.Secret[];
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

### Monogo

AWS ECS Fargate mongo service.

Features:

- has persistent storage
- comes with service discovery namespace
- creates CloudWatch log group
- comes with predefined cpu and memory options: `small`, `medium`, `large`, `xlarge`

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
  port?: pulumi.Input<number>;
  size?: pulumi.Input<Size>;
  cluster: aws.ecs.Cluster;
  vpc: awsx.ec2.Vpc;
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  secrets?: aws.ecs.Secret[] | ((services: Services) => aws.ecs.Secret[]);
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
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

The [Database](#database) component deploys a database instance inside a isolated subnet,
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
because we are port forwarding traffic from
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
- [ ] Add MongoDB service
- [ ] Enable RDS password rotation
