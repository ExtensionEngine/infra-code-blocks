# `@studion/infra-code-blocks`

[![npm version](https://img.shields.io/npm/v/@studion/infra-code-blocks)](https://www.npmjs.com/package/@studion/infra-code-blocks)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CircleCI](https://dl.circleci.com/status-badge/img/gh/ExtensionEngine/infra-code-blocks/tree/master.svg?style=shield)](https://dl.circleci.com/status-badge/redirect/gh/ExtensionEngine/infra-code-blocks/tree/master)

Opinionated TypeScript building blocks for Pulumi-based AWS infrastructure.

> Deploying examples or components can create billable AWS resources. Preview changes before deploying and run `pulumi destroy` when resources are no longer needed.

## Table of contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [Usage](#usage)
- [SSM Connect](#ssm-connect)
- [API reference](#api-reference)
- [Development](#development)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Overview

`@studion/infra-code-blocks` provides reusable Pulumi components for common AWS infrastructure patterns used in Studion projects.

### When to use this package

Use this package when you want to:

- provision common AWS infrastructure patterns without rewriting Pulumi boilerplate
- standardize networking, compute, data, and observability setup across multiple services
- compose higher-level infrastructure from opinionated building blocks instead of low-level resources

This package is most useful for teams already working with Pulumi, AWS, and TypeScript.

### Scope

The package provides building blocks across four areas:

| Area                    | What it covers                                                             | Typical entry points                                                                                              |
| ----------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Networking and delivery | VPCs, ACM certificates, CloudFront, and static hosting                     | `Vpc`, `AcmCertificate`, `CloudFront`, `StaticSite`, `S3Assets`                                                   |
| Compute                 | Generic ECS services and ALB-backed web services                           | `EcsService`, `WebServer`, `WebServerBuilder`, `WebServerLoadBalancer`                                            |
| Data                    | PostgreSQL, replicas, SSM access helpers, Redis, and password storage      | `Database`, `DatabaseBuilder`, `DatabaseReplica`, `Ec2SSMConnect`, `ElastiCacheRedis`, `UpstashRedis`, `Password` |
| Observability           | OpenTelemetry collector integration, Grafana resources, and PromQL helpers | `OtelCollector`, `OtelCollectorBuilder`, `grafana`, `prometheus`                                                  |

## Quick start

### Prerequisites

**Required for all usage**

- Node.js 20 or newer and npm.
- A Pulumi TypeScript project. If you do not already have one, `pulumi new aws-typescript` is a suitable starting point.

**Required for AWS deployment**

- Pulumi CLI authenticated with `pulumi login`.
- AWS credentials with permissions for the resources you create.
- Pulumi AWS provider region configuration, for example `pulumi config set aws:region eu-central-1` (environment: `AWS_REGION`). Region-aware components use an explicit component `region` when provided and otherwise derive the region from the active AWS provider.

**Required only for ECS/web-service components**

- An ECS cluster when using `EcsService`, `WebServer`, or `WebServerBuilder`.

**Required only for DNS/TLS/static-site/custom-domain components**

- A Route 53 hosted zone.
- A domain name managed by or delegated to that hosted zone.

**Required only for database and SSM Connect components**

- Private or isolated subnets from this package's `Vpc` component or a compatible AWSX VPC.
- AWS CLI and the Session Manager plugin when opening local SSM tunnels.

**Required only for Grafana components**

- Grafana Cloud stack URL configured as Pulumi config `grafana:url` or environment variable `GRAFANA_URL`, for example `https://<stack>.grafana.net`.
- Grafana Cloud access policy token configured for the Grafana provider as Pulumi config `grafana:cloudAccessPolicyToken` or environment variable `GRAFANA_CLOUD_ACCESS_POLICY_TOKEN`.
- Initial Grafana Cloud token scopes: `accesspolicies:read`, `accesspolicies:write`, `accesspolicies:delete`, `stacks:read`, and `stack-service-accounts:write`.
- The access policy managed by this package includes the scopes needed for data sources, dashboards, and plugins.

**Required only for Upstash components**

- Pulumi config value `upstash:apiKey` (environment: `UPSTASH_API_KEY`).
- Pulumi config value `upstash:email` (environment: `UPSTASH_EMAIL`).

### Install

```bash
npm install @studion/infra-code-blocks
```

### Minimal deploy flow

Use this flow in a new directory if you want the shortest domain-free path from a Pulumi project to a deployed resource:

```bash
pulumi new aws-typescript
npm install @studion/infra-code-blocks
pulumi config set aws:region eu-central-1
```

Add a minimal VPC to your Pulumi program:

```ts
import * as studion from '@studion/infra-code-blocks';

const vpc = new studion.Vpc('app');

export const vpcId = vpc.vpc.vpcId;
```

Preview, deploy, and clean up when finished:

```bash
pulumi up
pulumi destroy
```

This example avoids Route 53 and ACM, but creating a VPC can still create billable AWS resources such as NAT gateways depending on provider defaults and region.

### Typical next steps

1. Start with a foundation resource such as `Vpc`.
2. Add higher-level components such as `WebServer`, `Database`, `ElastiCacheRedis`, or `StaticSite`.
3. Export the resulting IDs, ARNs, hostnames, or endpoints from your stack.
4. Use `pulumi preview` before deploying and `pulumi destroy` for cleanup in temporary environments.

## Usage

### Create a VPC and ACM certificate

Use this example when your stack already has a public Route 53 hosted zone and you need a DNS-validated certificate:

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const hostedZone = aws.route53.getZoneOutput({
  name: 'example.com',
  privateZone: false,
});

const vpc = new studion.Vpc('app');

const certificate = new studion.AcmCertificate('app-cert', {
  domain: 'app.example.com',
  hostedZoneId: hostedZone.zoneId,
});

export const vpcId = vpc.vpc.vpcId;
export const certificateArn = certificate.certificate.arn;
```

### Create an ECS web service with OpenTelemetry

This example creates the surrounding AWS resources required by the web service instrumentation: a VPC, ECS cluster, CloudWatch log group, and AWS Managed Service for Prometheus workspace. It also expects the AWS provider region to be configured through `aws:region` or `AWS_REGION`.

```ts
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as studion from '@studion/infra-code-blocks';

const env = pulumi.getStack();
const vpc = new studion.Vpc('app');
const cluster = new aws.ecs.Cluster('app-cluster', {});
const logGroup = new aws.cloudwatch.LogGroup('app-otel-logs', {});
const workspace = new aws.amp.Workspace('app-amp', {});

const otelCollector = new studion.OtelCollectorBuilder('app', env)
  .withDefault({
    prometheusNamespace: 'app',
    prometheusWorkspace: workspace,
    region: aws.config.requireRegion(),
    logGroup,
    logStreamName: 'app',
  })
  .build();

const web = new studion.WebServerBuilder('app')
  .withContainer('nginx:stable', 80, {
    environment: [
      { name: 'OTEL_SERVICE_NAME', value: 'app' },
      { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', value: 'http://127.0.0.1:4318' },
      { name: 'OTEL_EXPORTER_OTLP_PROTOCOL', value: 'http/json' },
    ],
  })
  .withEcsConfig({
    cluster,
    desiredCount: 1,
    size: 'small',
    autoscaling: { enabled: false },
  })
  .withVpc(vpc.vpc)
  .withOtelCollector(otelCollector)
  .build();

export const webServiceName = web.service.apply(
  ecsService => ecsService.service.name,
);
```

## SSM Connect

`Database` instances are deployed inside isolated subnets and are not publicly reachable. When you need operator access for migrations, debugging, or a desktop database client, this package can provision an `Ec2SSMConnect` helper host that stays private and is reachable through AWS Systems Manager.

This workflow reuses the helper EC2 instance plus the SSM, EC2 Messages, and SSM Messages VPC interface endpoints created by the component, so you do not need a bastion with a public IP or SSH key pair. The helper instance itself accepts SSH only from within the VPC, while your local machine connects through an SSM session.

![AWS RDS connection schema](https://raw.githubusercontent.com/ExtensionEngine/infra-code-blocks/master/assets/images/ssm-rds.png)

### Prerequisites

1. Install the AWS CLI and the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html).
2. Ensure an AWS region is available. `Ec2SSMConnect` uses explicit `region` when provided and otherwise derives the region from the active AWS provider for region-specific VPC endpoint service names.
3. Provision a `Database` with SSM helper access enabled.

### Enable SSM access

Use the database builder when you want the database and helper instance created together:

```ts
import * as studion from '@studion/infra-code-blocks';

const vpc = new studion.Vpc('platform');

const database = new studion.DatabaseBuilder('platform-db')
  .withVpc(vpc.vpc)
  .withInstance({ dbName: 'platform' })
  .withCredentials({ username: 'platform_user' })
  .withSSMConnect({ instanceType: 't4g.small' })
  .build();

export const databaseAddress = database.instance.address;
export const databasePort = database.instance.port;
export const ssmHostId = database.ec2SSMConnect!.ec2.id;
```

You can also provision `Ec2SSMConnect` directly when you want a standalone helper host for an existing VPC:

```ts
import * as studion from '@studion/infra-code-blocks';

const vpc = new studion.Vpc('platform');

const ssmConnect = new studion.Ec2SSMConnect('platform-db-ssm', {
  vpc: vpc.vpc,
  instanceType: 't4g.small',
});

export const ssmHostId = ssmConnect.ec2.id;
```

### Open the tunnel

Export the stack outputs into local shell variables:

```bash
export SSM_HOST_ID=$(pulumi stack output ssmHostId)
export DATABASE_ADDRESS=$(pulumi stack output databaseAddress)
export DATABASE_PORT=$(pulumi stack output databasePort)
```

Start a single SSM port-forwarding session from your laptop to the private database through the helper instance:

```bash
aws ssm start-session --target "$SSM_HOST_ID" --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "{\"host\":[\"$DATABASE_ADDRESS\"],\"portNumber\":[\"$DATABASE_PORT\"],\"localPortNumber\":[\"5555\"]}"
```

Where:

- `SSM_HOST_ID` is the exported EC2 instance ID from `database.ec2SSMConnect.ec2.id` or `ssmConnect.ec2.id`.
- `DATABASE_ADDRESS` is the RDS endpoint, for example `database.instance.address`.
- `DATABASE_PORT` is the RDS port, for example `database.instance.port`.

Keep that command running, then connect your database client to `localhost:5555` using the same database name, username, and password you configured for the `Database` component. The examples above do not export database credentials automatically.

![RDS connection](https://raw.githubusercontent.com/ExtensionEngine/infra-code-blocks/master/assets/images/rds-connection.png)

## API reference

| Export                  | Kind      | Use it for                                     | Docs                                                        |
| ----------------------- | --------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `Vpc`                   | class     | Standard AWSX VPC with fixed subnet ordering.  | [vpc](src/components/vpc/README.md)                         |
| `AcmCertificate`        | class     | ACM certificate with Route 53 DNS validation.  | [acm-certificate](src/components/acm-certificate/README.md) |
| `EcsService`            | class     | Generic ECS/Fargate service composition.       | [ecs-service](src/components/ecs-service/README.md)         |
| `WebServer`             | class     | ALB-backed ECS web service.                    | [web-server](src/components/web-server/README.md)           |
| `WebServerBuilder`      | class     | Fluent builder for `WebServer`.                | [web-server](src/components/web-server/README.md)           |
| `WebServerLoadBalancer` | class     | Standalone ALB and target group.               | [web-server](src/components/web-server/README.md)           |
| `Database`              | class     | PostgreSQL primary instance with extras.       | [database](src/components/database/README.md)               |
| `DatabaseBuilder`       | class     | Fluent builder for `Database`.                 | [database](src/components/database/README.md)               |
| `DatabaseReplica`       | class     | PostgreSQL read replica.                       | [database](src/components/database/README.md)               |
| `Ec2SSMConnect`         | class     | Private EC2 helper reachable through SSM.      | [database](src/components/database/README.md)               |
| `ElastiCacheRedis`      | class     | VPC-scoped Redis on ElastiCache.               | [redis](src/components/redis/README.md)                     |
| `UpstashRedis`          | class     | Managed Redis on Upstash.                      | [redis](src/components/redis/README.md)                     |
| `Password`              | class     | Secret-backed password generation and storage. | [password](src/components/password/README.md)               |
| `CloudFront`            | class     | Behavior-driven CloudFront distribution.       | [cloudfront](src/components/cloudfront/README.md)           |
| `StaticSite`            | class     | S3 website plus CloudFront composition.        | [static-site](src/components/static-site/README.md)         |
| `S3Assets`              | class     | Public S3 website bucket for static assets.    | [static-site](src/components/static-site/README.md)         |
| `OtelCollector`         | class     | ECS-side collector container generation.       | [otel](src/otel/README.md)                                  |
| `OtelCollectorBuilder`  | class     | Fluent builder for OTel collector sidecars.    | [otel](src/otel/README.md)                                  |
| `grafana`               | namespace | Grafana folders, data sources, and dashboards. | [grafana](src/components/grafana/README.md)                 |
| `prometheus`            | namespace | PromQL query helpers for SLOs and latency.     | [prometheus](src/components/prometheus/README.md)           |

## Development

These steps are for contributors developing this package, not for consumers using it in a Pulumi project.

### Prerequisites

- Install dependencies with `npm install`.
- Install the AWS and Pulumi CLIs.
- Configure AWS credentials, preferably with an `AWS_PROFILE` that uses SSO.
- Authenticate Pulumi with `pulumi login`.
- Set these environment variables when running the full test suite; all are required for the complete integration/E2E suite:
  - `AWS_REGION`
  - `ICB_DOMAIN_NAME`
  - `ICB_HOSTED_ZONE_ID`
  - `GRAFANA_AWS_ACCOUNT_ID`
  - `GRAFANA_CLOUD_ACCESS_POLICY_TOKEN`
  - `GRAFANA_URL`
  - `UPSTASH_API_KEY`
  - `UPSTASH_EMAIL`

### Commands

```bash
npm run build                                        # Compile the package into dist/
npm run format                                       # Format code using Prettier
npm run test                                         # Run the integration/E2E test suite
npm run test -- tests/<component-name>/index.test.ts # Run integration/E2E tests for specific component(s)
npm run test:build                                   # Run build validation and type-level checks
```

## Contributing

Contributions should keep the documentation and exported API aligned.

1. Install dependencies with `npm install`.
2. Make your changes in `src/` and update any affected README files.
3. Add or update integration/E2E tests and run `npm run test -- tests/<component-name>/index.test.ts` when your change affects infrastructure behavior.
4. Add or update build-level tests and run `npm run test:build` when your change affects public API.
5. The pre-commit hook will automatically format code before committing, or you can run `npm run format` manually.

## Troubleshooting

- **Missing AWS region or provider-region error:** configure the AWS provider region, for example with `pulumi config set aws:region <region>` or `AWS_REGION`, or pass an explicit component `region` where supported.
- **AWS credentials, profile, or authorization errors:** configure AWS credentials, set the intended `AWS_PROFILE`, and confirm the identity has the required permissions.
- **Route 53 validation or custom-domain setup failure:** confirm that the domain is managed by, or delegated to, the hosted zone whose ID you passed to the component.
- **ACM certificate validation appears stuck:** DNS validation can take time. Check that the generated Route 53 validation record exists in the public hosted zone.
- **`aws ssm start-session` fails before opening a tunnel:** install the Session Manager plugin, verify `SSM_HOST_ID`, and confirm the helper instance is managed by Systems Manager.
- **Grafana authentication or authorization errors:** check `grafana:cloudAccessPolicyToken`, `grafana:url`, and the required access-policy scopes.
- **Upstash provider authentication errors:** check `upstash:apiKey` and `upstash:email`.
- **CloudFront or static-site deployments appear slow:** CloudFront distribution creation and updates commonly take several minutes.

## License

[MIT](LICENSE)
