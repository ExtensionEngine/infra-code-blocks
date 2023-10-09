# `@studion/infra-code-blocks`

Studion Platform common infra components.

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
3. [API](#api)

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
  environment: 'DEVELOPMENT',
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
  )[];
  environment: Environment;
  hostedZoneId?: pulumi.Input<string>;
};
```

| Argument       |                               Description                               |
| :------------- | :---------------------------------------------------------------------: |
| services \*    |                              Service list.                              |
| environment \* |                            Environment name.                            |
| hostedZoneId   | Route53 hosted zone ID responsible for managing records for the domain. |

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
};
```

```ts
export type WebServerService = {
  type: 'WEB_SERVER';
  serviceName: string;
  environment?:
    | aws.ecs.KeyValuePair[]
    | ((services: Services) => aws.ecs.KeyValuePair[]);
  image: pulumi.Input<string>;
  port: pulumi.Input<number>;
  domain: pulumi.Input<string>;
  desiredCount?: pulumi.Input<number>;
  minCount?: pulumi.Input<number>;
  maxCount?: pulumi.Input<number>;
  size?: pulumi.Input<Size>;
  healtCheckPath?: pulumi.Input<string>;
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
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

### Database

RDS Postgres instance.

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
};
```

### Redis

Upstash Redis instance.

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

### Static Site

A static site that will be deployed using S3 + Cloudfront.

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
};
```

### Web Server

A web server that will be deployed to ECS Fargate service with autoscaling enabled.

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
  healtCheckPath?: pulumi.Input<string>;
  taskExecutionRoleInlinePolicies?: pulumi.Input<
    pulumi.Input<RoleInlinePolicy>[]
  >;
  taskRoleInlinePolicies?: pulumi.Input<pulumi.Input<RoleInlinePolicy>[]>;
};
```

## 🚧 TODO

- [ ] Allow connection with RDS via ec2 instance
- [ ] Add worker service for executing tasks
