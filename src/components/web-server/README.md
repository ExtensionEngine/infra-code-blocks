# `src/components/web-server`

The web-server module supplies components to expose ECS services via an internet-facing ALB, using a fluent builder interface for easy assembly.

Use it when a workload needs package-standard public HTTP/HTTPS ingress, load-balancer security groups, target-group wiring, configurable health checks, and optional TLS/Route53 custom-domain support on top of `EcsService`.

## Usage examples

### Happy path

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const vpc = new studion.Vpc('app');
const cluster = new aws.ecs.Cluster('app-cluster', {});

const webServer = new studion.WebServerBuilder('app')
  .withContainer('nginx:stable', 80)
  .withEcsConfig({
    cluster,
    desiredCount: 1,
    size: 'small',
    autoscaling: { enabled: false },
  })
  .withVpc(vpc.vpc)
  .build();

export const loadBalancerDns = webServer.lb.lb.dnsName;
export const serviceName = webServer.service.apply(
  service => service.service.name,
);
```

### Non-trivial scenario

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const hostedZone = aws.route53.getZoneOutput({
  name: 'example.com',
  privateZone: false,
});

const vpc = new studion.Vpc('platform');
const cluster = new aws.ecs.Cluster('platform-cluster', {});

const taskExecutionPolicy: aws.types.input.iam.RoleInlinePolicy = {
  name: 'allow-parameter-read',
  policy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['ssm:GetParameter'],
        Resource: '*',
      },
    ],
  }),
};

const webServer = new studion.WebServer('platform-api', {
  vpc: vpc.vpc,
  cluster,
  image: 'ghcr.io/example/platform-api:1.0.0',
  port: 8080,
  desiredCount: 2,
  size: 'medium',
  autoscaling: {
    enabled: true,
    minCount: 2,
    maxCount: 4,
  },
  domain: 'api.example.com',
  hostedZoneId: hostedZone.zoneId,
  healthCheckPath: '/readyz',
  healthCheckConfig: {
    healthyThreshold: 5,
    unhealthyThreshold: 3,
    interval: 15,
    timeout: 3,
  },
  loadBalancingAlgorithmType: 'round_robin',
  taskExecutionRoleInlinePolicies: [taskExecutionPolicy],
  volumes: [{ name: 'shared-data' }],
  environment: [{ name: 'APP_ENV', value: 'prod' }],
  mountPoints: [
    {
      sourceVolume: 'shared-data',
      containerPath: '/var/lib/app',
    },
  ],
  initContainers: [
    {
      name: 'migrate',
      image: 'ghcr.io/example/platform-api:1.0.0',
      command: ['node', 'dist/migrate.js'],
      mountPoints: [
        {
          sourceVolume: 'shared-data',
          containerPath: '/var/lib/app',
        },
      ],
    },
  ],
  sidecarContainers: [
    {
      name: 'config-reloader',
      image: 'ghcr.io/example/config-reloader:1.0.0',
      environment: [{ name: 'CONFIG_PATH', value: '/var/lib/app/config.json' }],
      healthCheck: {
        command: ['CMD-SHELL', 'test -f /tmp/healthy || exit 1'],
        interval: 30,
        timeout: 5,
        retries: 3,
        startPeriod: 10,
      },
    },
  ],
});

export const httpsListenerArn = webServer.lb.tlsListener?.arn;
export const ecsServiceArn = webServer.service.apply(
  service => service.service.id,
);
```

## Implementation notes

- `WebServer` requires `hostedZoneId` whenever `domain` or `certificate` is provided.
- If `domain` and `hostedZoneId` are provided without `certificate`, `WebServer` creates an `AcmCertificate` child in the active AWS provider region and waits for validation before creating the HTTPS listener.
- The main application container is always named after the component name, always gets exactly one TCP port mapping created from `EcsService.createTcpPortMapping(port)`, and is always marked `essential: true`.
- `initContainers` are always rewritten to `essential: false` before the nested ECS service is created.
- `sidecarContainers` are always rewritten to `essential: true` before the nested ECS service is created.
- If an `otelCollector` is provided, `WebServer` appends its config volume, config-writer init container, collector sidecar container, and task-role policy fragments into the final ECS service inputs.
- Current implementation note: when `otelCollector` is provided, task-role policy fragments from the collector are combined with `taskExecutionRoleInlinePolicies` and passed to the nested `EcsService` as task-role inline policies. Review generated IAM roles when combining custom execution-role policies with OTEL.
- The nested ECS service disables service discovery, sets `assignPublicIp: true`, and registers the main container with the load balancer target group.
- `WebServerLoadBalancer` creates an internet-facing application load balancer in public subnets and defaults `healthCheckPath` to `'/healthcheck'`.
- Target-group health checks use `healthCheckPath` for `healthCheck.path` and merge `healthCheckConfig` into the remaining target-group health-check settings. The component default config is `{ healthyThreshold: 3, unhealthyThreshold: 2, interval: 60, timeout: 5 }`.
- `healthCheckConfig` is shallow-merged through the component defaults; supplying it replaces the default health-check config object, so include every non-path health-check value you want to control explicitly.
- If a certificate is provided to `WebServerLoadBalancer`, port `80` redirects to HTTPS and a TLS listener on port `443` is created with `ELBSecurityPolicy-TLS13-1-2-2021-06`. Without a certificate, port `80` forwards directly to the target group.
- The load balancer security group always allows inbound TCP on ports `80` and `443` from `0.0.0.0/0` and allows all outbound traffic.
- The web-server service security group allows all protocols and ports from the load balancer security group and allows all outbound traffic.
- When custom-domain mode is enabled, Route53 alias records point at the ALB. If `domain` is provided, only that alias is created; otherwise aliases are derived from the certificate domain name and subject alternative names.
- `WebServerBuilder.build()` throws unless `withContainer()`, `withEcsConfig()`, and `withVpc()` have all been called first.

## API Reference

### `WebServer`

**Signature**

```ts
class WebServer extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: WebServer.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                      |
| -------------------------------------------- | ------------------------------------------------ |
| `name`\*<br/>`string`                        | Logical Pulumi component name.                   |
| `args`\*<br/>`WebServer.Args`                | Web-server and ECS service configuration object. |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options.      |

**Configuration Options**

Direct constructor input: `args: WebServer.Args`

| Property                                                                                                                               | Description                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image`\*<br/>`pulumi.Input<string>`                                                                                                   | Main application container image.                                                                                                                                                     |
| `port`\*<br/>`pulumi.Input<number>`                                                                                                    | Main application container port.                                                                                                                                                      |
| `environment`<br/>`pulumi.Input<aws.ecs.KeyValuePair[]>`                                                                               | Static environment variables for the main container.                                                                                                                                  |
| `secrets`<br/>`pulumi.Input<aws.ecs.Secret[]>`                                                                                         | ECS secret references for the main container.                                                                                                                                         |
| `mountPoints`<br/>`EcsService.PersistentStorageMountPoint[]`                                                                           | Persistent storage mounts for the main container.                                                                                                                                     |
| `cluster`\*<br/>`pulumi.Input<aws.ecs.Cluster>`                                                                                        | ECS cluster used by the nested `EcsService`.                                                                                                                                          |
| `vpc`\*<br/>`pulumi.Input<awsx.ec2.Vpc>`                                                                                               | Source of public subnets for the ALB and network data for ECS.                                                                                                                        |
| `volumes`<br/>`pulumi.Input<pulumi.Input<EcsService.PersistentStorageVolume>[]>`                                                       | Logical ECS volumes passed into the nested `EcsService`. Default: `[]`.                                                                                                               |
| `name`<br/>`pulumi.Input<string>`                                                                                                      | Optional ECS service name override forwarded to `EcsService`. Default: `EcsService` default.                                                                                          |
| `deploymentController`<br/>`'ECS' \| 'CODE_DEPLOY' \| 'EXTERNAL'`                                                                      | Optional ECS deployment controller. Default: `EcsService` default.                                                                                                                    |
| `desiredCount`<br/>`pulumi.Input<number>`                                                                                              | Desired task count for the nested ECS service. Default: `EcsService` default.                                                                                                         |
| `autoscaling`<br/>`pulumi.Input<{ enabled: pulumi.Input<boolean>; minCount?: pulumi.Input<number>; maxCount?: pulumi.Input<number> }>` | ECS target-tracking autoscaling configuration. Default: `EcsService` default.                                                                                                         |
| `family`<br/>`pulumi.Input<string>`                                                                                                    | Optional task definition family override. Default: `EcsService` default.                                                                                                              |
| `size`<br/>`pulumi.Input<TaskSize>`                                                                                                    | ECS CPU/memory preset or explicit size object. Default: `EcsService` default.                                                                                                         |
| `logGroupNamePrefix`<br/>`pulumi.Input<string>`                                                                                        | CloudWatch log group name prefix forwarded to `EcsService`. Default: `EcsService` default.                                                                                            |
| `taskExecutionRoleInlinePolicies`<br/>`pulumi.Input<pulumi.Input<EcsService.RoleInlinePolicy>[]>`                                      | Extra execution-role inline policies.                                                                                                                                                 |
| `taskRoleInlinePolicies`<br/>`pulumi.Input<pulumi.Input<EcsService.RoleInlinePolicy>[]>`                                               | Extra task-role inline policies.                                                                                                                                                      |
| `tags`<br/>`pulumi.Input<{ [key: string]: pulumi.Input<string> }>`                                                                     | Extra tags forwarded to nested ECS resources.                                                                                                                                         |
| `domain`<br/>`pulumi.Input<string>`                                                                                                    | Custom DNS name for the ALB endpoint.                                                                                                                                                 |
| `certificate`<br/>`pulumi.Input<aws.acm.Certificate>`                                                                                  | Existing ACM certificate for TLS termination.                                                                                                                                         |
| `hostedZoneId`<br/>`pulumi.Input<string>`                                                                                              | Required: whenever `domain` or `certificate` is provided.                                                                                                                             |
| `healthCheckPath`<br/>`pulumi.Input<string>`                                                                                           | ALB target-group health-check path. Default: `'/healthcheck'`.                                                                                                                        |
| `healthCheckConfig`<br/>`Omit<aws.types.input.lb.TargetGroupHealthCheck, 'path'>`                                                      | Target-group health-check settings other than `path`; `path` is controlled by `healthCheckPath`. Default: `{ healthyThreshold: 3, unhealthyThreshold: 2, interval: 60, timeout: 5 }`. |
| `loadBalancingAlgorithmType`<br/>`pulumi.Input<string>`                                                                                | Forwarded directly to the ALB target group. Default: AWS default.                                                                                                                     |
| `initContainers`<br/>`pulumi.Input<pulumi.Input<WebServer.InitContainer>[]>`                                                           | Additional init containers. Default: `[]`.                                                                                                                                            |
| `sidecarContainers`<br/>`pulumi.Input<pulumi.Input<WebServer.SidecarContainer>[]>`                                                     | Additional sidecars. Default: `[]`.                                                                                                                                                   |
| `otelCollector`<br/>`pulumi.Input<OtelCollector>`                                                                                      | Collector integration that contributes containers, volumes, and IAM policy fragments.                                                                                                 |

**Outputs**

| Property                                                                         | Description                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `name`<br/>`string`                                                              | Component name.                                                                    |
| `container`<br/>`WebServer.Container`                                            | Main container definition before ECS-specific transformation.                      |
| `ecsConfig`<br/>`WebServer.EcsConfig`                                            | ECS configuration object used to create the nested service.                        |
| `service`<br/>`pulumi.Output<EcsService>`                                        | Nested ECS service component.                                                      |
| `serviceSecurityGroup`<br/>`aws.ec2.SecurityGroup`                               | Security group attached to ECS tasks.                                              |
| `lb`<br/>`WebServerLoadBalancer`                                                 | Nested load-balancer component.                                                    |
| `initContainers`<br/>`pulumi.Output<EcsService.Container[]> \| undefined`        | Final init containers after OTEL augmentation and `essential: false` rewriting.    |
| `sidecarContainers`<br/>`pulumi.Output<EcsService.Container[]> \| undefined`     | Final sidecar containers after OTEL augmentation and `essential: true` rewriting.  |
| `volumes`<br/>`pulumi.Output<EcsService.PersistentStorageVolume[]> \| undefined` | Final logical volumes after OTEL augmentation.                                     |
| `acmCertificate`<br/>`AcmCertificate \| undefined`                               | Automatically created certificate when `domain` is supplied without `certificate`. |
| `dnsRecords`<br/>`pulumi.Output<aws.route53.Record[]> \| undefined`              | Route53 alias records that point at the ALB in custom-domain mode.                 |

**Supporting Types**

**`WebServer.Container`**

```ts
type Container = Pick<
  EcsService.Container,
  'image' | 'environment' | 'secrets' | 'mountPoints'
> & {
  port: pulumi.Input<number>;
};
```

Used to define the main application container before ECS-specific transformation. Combined with the other types to create `WebServer.Args` intersection type.

**`WebServer.EcsConfig`**

```ts
type EcsConfig = Pick<
  EcsService.Args,
  | 'cluster'
  | 'vpc'
  | 'volumes'
  | 'name'
  | 'deploymentController'
  | 'desiredCount'
  | 'autoscaling'
  | 'family'
  | 'size'
  | 'logGroupNamePrefix'
  | 'taskExecutionRoleInlinePolicies'
  | 'taskRoleInlinePolicies'
  | 'tags'
>;
```

Forwarded into the nested `EcsService` after the web-server-specific ALB wiring is added. Combined with the other types to create `WebServer.Args` intersection type.

**`WebServer.InitContainer`**

```ts
type InitContainer = Omit<EcsService.Container, 'essential'>;
```

Init containers are always rewritten to `essential: false` before the nested ECS service is created.

**`WebServer.SidecarContainer`**

```ts
type SidecarContainer = Omit<
  EcsService.Container,
  'essential' | 'healthCheck'
> &
  Required<Pick<EcsService.Container, 'healthCheck'>>;
```

Sidecar containers are always rewritten to `essential: true`, and `healthCheck` is required.

### `WebServerBuilder`

**Signature**

```ts
class WebServerBuilder {
  constructor(name: string);
}
```

**Constructor Parameters**

| Parameter             | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `name`\*<br/>`string` | Base name used when `build()` constructs the `WebServer`. |

**Builder Methods**

| Method                       | Parameters                                                                                                                          | Description                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `withContainer`              | `image: WebServer.Container['image'], port: WebServer.Container['port'], config: Omit<WebServer.Container, 'image' \| 'port'> = {}` | Stores the main application container.                                            |
| `withEcsConfig`              | `config: WebServerBuilder.EcsConfig`                                                                                                | Stores ECS cluster and service configuration.                                     |
| `withVpc`                    | `vpc: pulumi.Input<awsx.ec2.Vpc>`                                                                                                   | Stores the required VPC.                                                          |
| `withVolume`                 | `volume: EcsService.PersistentStorageVolume`                                                                                        | Adds one logical ECS volume.                                                      |
| `withCustomDomain`           | `domain: pulumi.Input<string>, hostedZoneId: pulumi.Input<string>`                                                                  | Stores custom-domain settings and enables managed ACM flow.                       |
| `withCertificate`            | `certificate: WebServer.Args['certificate'], hostedZoneId: pulumi.Input<string>, domain?: pulumi.Input<string>`                     | Stores an existing certificate and hosted zone configuration.                     |
| `addInitContainer`           | `container: WebServer.InitContainer`                                                                                                | Adds one init container.                                                          |
| `addSidecarContainer`        | `container: WebServer.SidecarContainer`                                                                                             | Adds one sidecar container.                                                       |
| `withOtelCollector`          | `collector: OtelCollector`                                                                                                          | Attaches collector-provided containers, volume, and IAM policy fragments.         |
| `withHealthCheck`            | `path: WebServer.Args['healthCheckPath'], config?: WebServer.Args['healthCheckConfig']`                                             | Stores the ALB health-check path and optional target-group health-check settings. |
| `withLoadBalancingAlgorithm` | `algorithm: pulumi.Input<string>`                                                                                                   | Stores the target-group load-balancing algorithm.                                 |
| `build`                      | `opts?: pulumi.ComponentResourceOptions`                                                                                            | Validates collected state and returns a `WebServer`.                              |

**Build Result**

```ts
build(opts?: pulumi.ComponentResourceOptions): WebServer
```

| Return Type | Description                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `WebServer` | Returns a `WebServer` assembled from the collected builder state and throws if required builder state is missing. |

**Supporting Types**

**`WebServerBuilder.EcsConfig`**

```ts
type EcsConfig = Omit<WebServer.EcsConfig, 'vpc' | 'volumes'>;
```

| Difference from `WebServer.EcsConfig` | Description                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| Omits `vpc`                           | `WebServerBuilder` collects the VPC separately via `withVpc()`.    |
| Omits `volumes`                       | `WebServerBuilder` collects volumes separately via `withVolume()`. |

### `WebServerLoadBalancer`

**Signature**

```ts
class WebServerLoadBalancer extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: WebServerLoadBalancer.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`WebServerLoadBalancer.Args`    | Load-balancer configuration object.         |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: WebServerLoadBalancer.Args`

| Property                                                                          | Description                                                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `vpc`\*<br/>`pulumi.Input<awsx.ec2.Vpc>`                                          | VPC whose public subnets host the ALB.                                                                                                     |
| `port`\*<br/>`pulumi.Input<number>`                                               | Target-group port.                                                                                                                         |
| `certificate`<br/>`pulumi.Input<aws.acm.Certificate>`                             | Enables a TLS listener and HTTP-to-HTTPS redirect.                                                                                         |
| `healthCheckPath`<br/>`pulumi.Input<string>`                                      | Target-group health-check path. Default: `'/healthcheck'`.                                                                                 |
| `healthCheckConfig`<br/>`Omit<aws.types.input.lb.TargetGroupHealthCheck, 'path'>` | Target-group health-check settings other than `path`. Default: `{ healthyThreshold: 3, unhealthyThreshold: 2, interval: 60, timeout: 5 }`. |
| `loadBalancingAlgorithmType`<br/>`pulumi.Input<string>`                           | Forwarded directly to the target group. Default: AWS default.                                                                              |

**Outputs**

| Property                                         | Description                                         |
| ------------------------------------------------ | --------------------------------------------------- |
| `name`<br/>`string`                              | Component name.                                     |
| `lb`<br/>`aws.lb.LoadBalancer`                   | Internet-facing application load balancer.          |
| `targetGroup`<br/>`aws.lb.TargetGroup`           | IP target group for the ECS service.                |
| `httpListener`<br/>`aws.lb.Listener`             | Port `80` listener.                                 |
| `tlsListener`<br/>`aws.lb.Listener \| undefined` | Port `443` listener when a certificate is provided. |
| `securityGroup`<br/>`aws.ec2.SecurityGroup`      | Load-balancer security group.                       |
