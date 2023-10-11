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
  enableSSMConnect?: pulumi.Input<boolean>;
};
```

| Argument         |                                                                         Description                                                                          |
| :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------: |
| services \*      |                                                                        Service list.                                                                         |
| environment \*   |                                                                      Environment name.                                                                       |
| hostedZoneId     |                                           Route53 hosted zone ID responsible for managing records for the domain.                                            |
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

## SSM Connect

The [Database](#database) component deploys a database instance inside a private subnet,
and it's not publicly accessible from outside of VPC.
<br>
In order to connect to the database we need to deploy the ec2 instance which will be used
to open an SSH tunnel to the database instance.
<br>
Because of security reasons, ec2 instance is also deployed inside private subnet
which means we can't directly connect to it. For that purpose, we use AWS System Manager
which enables us to connect to the ec2 instance even though it's inside private subnet.

![AWS RDS connection schema](/assets/images/ssm-rds.png)

**Prerequisites**

1. Install the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/install-plugin-macos-overview.html#install-plugin-macos)
2. Generate a new ssh key pair or use the existing one.

```bash
$ ssh-keygen -f my_rsa
```

3. Set stack config property by running:

```bash
$ pulumi config set ssh:publicKey "ssh-rsa Z...9= mymac@Studions-MBP.localdomain"
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
$ aws ssm start-session --target EC2_INSTANCE_ID --document-name AWS-StartPortForwardingSession --parameters '{"portNumber":["22"], "localPortNumber":["9999"]}'
```

Where `EC2_INSTANCE_ID` is an ID of the EC2 instance that is created for you. ID can be
obtained by exporting it from the stack.

Next, open another terminal window and run the following command:

```bash
$ ssh ec2-user@localhost -p 9999 -N -L 5555:DATABASE_ADDRESS:DATABASE_PORT -i SSH_PRIVATE_KEY
```

Where `DATABASE_ADDRESS` and `DATABASE_PORT` are the address and port of the database instance,
and `SSH_PRIVATE_KEY` is the path to the SSH private key.

And that is it! 🥳
Now you can use your favorite database client to connect to the database.

![RDS connection](/assets/images/rds-connection.png)

It is important that for the host you set `localhost` and for the port you set `5555`
because we have an SSH tunnel open that forwards traffic from localhost:5555 to the
DATABASE_ADDRESS:DATABASE_PORT. For the user, password, and database field, set values
which are set in the `Project`.

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
- [ ] Update docs, describe each service, describe required stack configs...
