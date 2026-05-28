# `src/components/ecs-service`

`EcsService` is the package-standard ECS Fargate service wrapper for running one or more containers in an existing cluster and VPC.

Use it when you need ECS service plumbing—task definition, IAM roles, logging, networking, optional discovery/autoscaling, and shared EFS storage—without the public ALB, TLS, and DNS layer provided by `WebServer`.

## Usage examples

### Happy path

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const vpc = new studion.Vpc('app');
const cluster = new aws.ecs.Cluster('app-cluster', {});

const ecsService = new studion.EcsService('worker', {
  cluster,
  vpc: vpc.vpc,
  containers: [
    {
      name: 'worker',
      image: 'nginx:stable',
      portMappings: [studion.EcsService.createTcpPortMapping(80)],
    },
  ],
});

export const serviceName = ecsService.service.name;
export const logGroupName = ecsService.logGroup.name;
```

### Non-trivial scenario

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const vpc = new studion.Vpc('internal');
const cluster = new aws.ecs.Cluster('internal-cluster', {});

const taskRolePolicy: aws.types.input.iam.RoleInlinePolicy = {
  name: 'allow-s3-read',
  policy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Resource: '*',
      },
    ],
  }),
};

const service = new studion.EcsService('api', {
  cluster,
  vpc: vpc.vpc,
  size: 'medium',
  desiredCount: 2,
  enableServiceAutoDiscovery: true,
  autoscaling: {
    enabled: true,
    minCount: 2,
    maxCount: 6,
  },
  volumes: [{ name: 'shared-data' }],
  taskRoleInlinePolicies: [taskRolePolicy],
  containers: [
    {
      name: 'api',
      image: 'nginx:stable',
      portMappings: [studion.EcsService.createTcpPortMapping(8080)],
      mountPoints: [
        {
          sourceVolume: 'shared-data',
          containerPath: '/data',
        },
      ],
      environment: [{ name: 'APP_ENV', value: 'prod' }],
    },
  ],
});

export const discoveryArn = service.serviceDiscoveryService?.arn;
export const taskDefinitionArn = service.taskDefinition.apply(
  taskDefinition => taskDefinition.arn,
);
export const logGroupName = service.logGroup.name;
export const persistentFileSystemId = ecsService.persistentStorage.apply(
  storage => storage?.fileSystem.id,
);
export const persistentMountTargetIds = ecsService.persistentStorage.apply(
  storage =>
    storage?.mountTargets.apply(targets => targets.map(target => target.id)),
);
```

## Implementation notes

- The component uses an explicit `region` when provided and otherwise derives the region from the active AWS provider for each container definition's `awslogs-region` setting.
- The CloudWatch log group always uses `retentionInDays: 14` and defaults `namePrefix` to `/ecs/${name}-` unless `logGroupNamePrefix` is provided.
- The service always uses `launchType: 'FARGATE'` and `enableExecuteCommand: true`.
- The task definition always uses `networkMode: 'awsvpc'` and `requiresCompatibilities: ['FARGATE']`.
- Default ECS settings are `deploymentController: 'ECS'`, `desiredCount: 1`, `size: 'small'`, `assignPublicIp: false`, service discovery disabled, and autoscaling disabled with min/max counts of `1`.
- Network placement depends on `assignPublicIp`: public subnets are used when it is `true`, otherwise private subnets are used.
- Autoscaling, when enabled, is fixed to target-tracking policies for `ECSServiceAverageMemoryUtilization` and `ECSServiceAverageCPUUtilization`, both with `targetValue: 70`.
- Declaring any volumes creates one shared encrypted EFS file system, one access point rooted at `/data`, and exposes the resulting storage resources through `persistentStorage`; all logical ECS volumes map to that same backing storage.
- Persistent storage configures the ECS task definition with EFS volumes using transit encryption, IAM authorization, and the generated access point; container mount points still control each container path and default `readOnly` to `false`.
- The EFS file system uses `generalPurpose` performance, `bursting` throughput, and lifecycle policies that transition files to IA after 7 days and back to primary storage after one access.
- The EFS access point uses fixed POSIX user/group `1000:1000` and creates `/data` with owner `1000:1000` and permissions `0755`, matching the ECS task user created by this component.
- The EFS mount targets are created only in private subnets, and the EFS security group allows TCP/2049 from the VPC CIDR.
- ECS service waits for the generated EFS mount targets before creating the ECS service resource.
- Service discovery is created only when `enableServiceAutoDiscovery` is truthy; it creates a new private DNS namespace named exactly after the component name and an `A` record service with `ttl: 10`.
- If you do not pass `securityGroup`, the generated default service security group allows all inbound traffic from the VPC CIDR and all outbound traffic to `0.0.0.0/0`.
- Each container definition is copied with `readonlyRootFilesystem: false`, a default `awslogs` log configuration, and mount-point `readOnly` defaulting to `false`.
- The generated execution role always includes `CloudWatchFullAccess`, `AmazonEC2ContainerRegistryFullAccess`, and wildcard `ssm:GetParameters` / `secretsmanager:GetSecretValue` access.
- The generated task role always includes ECS Exec SSM channel permissions even if you never use ECS Exec.

## API Reference

### `EcsService`

**Signature**

```ts
class EcsService extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: EcsService.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`EcsService.Args`               | ECS service configuration object.           |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: EcsService.Args`

| Property                                                                                                                               | Description                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `cluster`\*<br/>`pulumi.Input<aws.ecs.Cluster>`                                                                                        | ECS cluster that will run the service.                                                                           |
| `vpc`\*<br/>`pulumi.Input<awsx.ec2.Vpc>`                                                                                               | Provides subnets, VPC ID, and CIDR-based security group rules.                                                   |
| `containers`\*<br/>`EcsService.Container[]`                                                                                            | Full task container list.                                                                                        |
| `loadBalancers`<br/>`pulumi.Input<EcsService.LoadBalancerConfig[]>`                                                                    | Optional ECS service-to-target-group registrations.                                                              |
| `volumes`<br/>`pulumi.Input<pulumi.Input<EcsService.PersistentStorageVolume>[]>`                                                       | Any non-empty value triggers creation of shared EFS-backed persistent storage. Default: `[]`.                    |
| `name`<br/>`pulumi.Input<string>`                                                                                                      | ECS service name override. Default: component name.                                                              |
| `deploymentController`<br/>`'ECS' \| 'CODE_DEPLOY' \| 'EXTERNAL'`                                                                      | ECS deployment controller type. Default: `'ECS'`.                                                                |
| `desiredCount`<br/>`pulumi.Input<number>`                                                                                              | Initial desired task count. Default: `1`.                                                                        |
| `family`<br/>`pulumi.Input<string>`                                                                                                    | Task definition family. Default: `<name>-task-definition-<stack>`.                                               |
| `size`<br/>`pulumi.Input<TaskSize>`                                                                                                    | CPU/memory preset or explicit `{ cpu, memory }` object. Default: `'small'`.                                      |
| `logGroupNamePrefix`<br/>`pulumi.Input<string>`                                                                                        | Passed to `aws.cloudwatch.LogGroup.namePrefix`. Default: `/ecs/<name>-`.                                         |
| `securityGroup`<br/>`pulumi.Input<aws.ec2.SecurityGroup>`                                                                              | If omitted, the component creates a VPC-wide internal service security group. Default: generated default SG.     |
| `assignPublicIp`<br/>`pulumi.Input<boolean>`                                                                                           | Selects public subnets when `true`, otherwise private subnets. Default: `false`.                                 |
| `taskExecutionRoleInlinePolicies`<br/>`pulumi.Input<pulumi.Input<EcsService.RoleInlinePolicy>[]>`                                      | Extra inline policies merged into the generated execution role. Default: `[]`.                                   |
| `taskRoleInlinePolicies`<br/>`pulumi.Input<pulumi.Input<EcsService.RoleInlinePolicy>[]>`                                               | Extra inline policies merged into the generated task role. Default: `[]`.                                        |
| `enableServiceAutoDiscovery`<br/>`pulumi.Input<boolean>`                                                                               | Creates a private DNS namespace and Cloud Map service. Default: `false`.                                         |
| `autoscaling`<br/>`pulumi.Input<{ enabled: pulumi.Input<boolean>; minCount?: pulumi.Input<number>; maxCount?: pulumi.Input<number> }>` | ECS target-tracking autoscaling configuration. Default: disabled.                                                |
| `region`<br/>`pulumi.Input<string>`                                                                                                    | AWS region used for region-specific ECS settings such as CloudWatch Logs. Default: active AWS provider's region. |
| `tags`<br/>`pulumi.Input<EcsService.Tags>`                                                                                             | Additional tags merged with the package common tags.                                                             |

**Outputs**

| Property                                                                           | Description                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`<br/>`string`                                                                | Component name.                                                                                                                                                  |
| `vpc`<br/>`pulumi.Output<awsx.ec2.Vpc>`                                            | VPC captured from the constructor arguments.                                                                                                                     |
| `logGroup`<br/>`aws.cloudwatch.LogGroup`                                           | CloudWatch log group for task logs.                                                                                                                              |
| `taskDefinition`<br/>`pulumi.Output<aws.ecs.TaskDefinition>`                       | Generated ECS task definition.                                                                                                                                   |
| `taskExecutionRole`<br/>`aws.iam.Role`                                             | Generated execution role.                                                                                                                                        |
| `taskRole`<br/>`aws.iam.Role`                                                      | Generated task role.                                                                                                                                             |
| `service`<br/>`aws.ecs.Service`                                                    | ECS service resource.                                                                                                                                            |
| `securityGroups`<br/>`pulumi.Output<aws.ec2.SecurityGroup>[]`                      | Attached service security groups.                                                                                                                                |
| `serviceDiscoveryService`<br/>`aws.servicediscovery.Service \| undefined`          | Cloud Map service created when autodiscovery is enabled.                                                                                                         |
| `persistentStorage`<br/>`pulumi.Output<EcsService.PersistentStorage \| undefined>` | Shared EFS-backed persistent storage output. The component property is always present, and its resolved value is `undefined` when `volumes` is omitted or empty. |

**Supporting Types**

**`EcsService.Container`**

```ts
type Container = {
  name: pulumi.Input<string>;
  image: pulumi.Input<string>;
  portMappings?: pulumi.Input<pulumi.Input<aws.ecs.PortMapping>[]>;
  command?: pulumi.Input<pulumi.Input<string>[]>;
  mountPoints?: EcsService.PersistentStorageMountPoint[];
  environment?: pulumi.Input<aws.ecs.KeyValuePair[]>;
  secrets?: pulumi.Input<aws.ecs.Secret[]>;
  dependsOn?: pulumi.Input<aws.ecs.ContainerDependency[]>;
  essential?: pulumi.Input<boolean>;
  healthCheck?: pulumi.Input<aws.ecs.HealthCheck>;
};
```

| Property                                                               | Description                                                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`\*<br/>`pulumi.Input<string>`                                    | Container name in the ECS task definition.                                                                                                     |
| `image`\*<br/>`pulumi.Input<string>`                                   | Container image URI or image name.                                                                                                             |
| `portMappings`<br/>`pulumi.Input<pulumi.Input<aws.ecs.PortMapping>[]>` | ECS port mappings exposed by the container.                                                                                                    |
| `command`<br/>`pulumi.Input<pulumi.Input<string>[]>`                   | Command override passed to the container. Default: image default.                                                                              |
| `mountPoints`<br/>`EcsService.PersistentStorageMountPoint[]`           | EFS-backed volume mount points for this container.                                                                                             |
| `environment`<br/>`pulumi.Input<aws.ecs.KeyValuePair[]>`               | Static environment variables. Default: `[]`.                                                                                                   |
| `secrets`<br/>`pulumi.Input<aws.ecs.Secret[]>`                         | ECS secret references exposed as environment variables. Default: `[]`.                                                                         |
| `dependsOn`<br/>`pulumi.Input<aws.ecs.ContainerDependency[]>`          | ECS container dependency conditions.                                                                                                           |
| `essential`<br/>`pulumi.Input<boolean>`                                | Controls whether task health depends on this container. Use `false` for one-shot setup containers. Default: ECS default / component transform. |
| `healthCheck`<br/>`pulumi.Input<aws.ecs.HealthCheck>`                  | ECS container health-check configuration.                                                                                                      |

**`EcsService.LoadBalancerConfig`**

```ts
type LoadBalancerConfig = {
  containerName: pulumi.Input<string>;
  containerPort: pulumi.Input<number>;
  targetGroupArn: aws.lb.TargetGroup['arn'];
};
```

| Property                                           | Description                                                   |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `containerName`\*<br/>`pulumi.Input<string>`       | Name of the container registered with the load balancer.      |
| `containerPort`\*<br/>`pulumi.Input<number>`       | Container port registered with the target group.              |
| `targetGroupArn`\*<br/>`aws.lb.TargetGroup['arn']` | ARN of the target group receiving traffic for this container. |

**`EcsService.PersistentStorageVolume`**

```ts
type PersistentStorageVolume = {
  name: pulumi.Input<string>;
};
```

| Property                            | Description                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `name`\*<br/>`pulumi.Input<string>` | Logical ECS volume name. Containers reference this value through `sourceVolume`. |

**`EcsService.PersistentStorageMountPoint`**

```ts
type PersistentStorageMountPoint = {
  sourceVolume: pulumi.Input<string>;
  containerPath: pulumi.Input<string>;
  readOnly?: pulumi.Input<boolean>;
};
```

| Property                                     | Description                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `sourceVolume`\*<br/>`pulumi.Input<string>`  | Name of a configured `PersistentStorageVolume`.                                      |
| `containerPath`\*<br/>`pulumi.Input<string>` | Filesystem path where the volume is mounted inside the container.                    |
| `readOnly`<br/>`pulumi.Input<boolean>`       | Whether the mount should be read-only in the container definition. Default: `false`. |

**`EcsService.PersistentStorage`**

```ts
type PersistentStorage = {
  fileSystem: aws.efs.FileSystem;
  accessPoint: aws.efs.AccessPoint;
  mountTargets: pulumi.Output<aws.efs.MountTarget[]>;
};
```

| Property                                                    | Description                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| `fileSystem`\*<br/>`aws.efs.FileSystem`                     | Shared encrypted EFS file system created for the service volumes.           |
| `accessPoint`\*<br/>`aws.efs.AccessPoint`                   | Access point used by ECS task volumes with IAM authorization enabled.       |
| `mountTargets`\*<br/>`pulumi.Output<aws.efs.MountTarget[]>` | EFS mount targets created in the VPC private subnets for the shared volume. |

**`EcsService.RoleInlinePolicy`**

```ts
type RoleInlinePolicy = aws.types.input.iam.RoleInlinePolicy;
```

Alias for Pulumi AWS IAM role inline policy input objects. Use it to pass additional inline policies into the generated execution role or task role.

**Inline `autoscaling` shape**

```ts
type Autoscaling = {
  enabled: pulumi.Input<boolean>;
  minCount?: pulumi.Input<number>;
  maxCount?: pulumi.Input<number>;
};
```

| Property                                | Description                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `enabled`\*<br/>`pulumi.Input<boolean>` | Enables or disables ECS target-tracking autoscaling. Default: `false`. |
| `minCount`<br/>`pulumi.Input<number>`   | Minimum scalable task count. Default: `1`.                             |
| `maxCount`<br/>`pulumi.Input<number>`   | Maximum scalable task count. Default: `1`.                             |

**`TaskSize`**

```ts
type TaskSize =
  | 'small'
  | 'medium'
  | 'large'
  | 'xlarge'
  | '2xlarge'
  | '3xlarge'
  | {
      cpu: pulumi.Input<number>;
      memory: pulumi.Input<number>;
    };
```

Explicit object form:

| Property                              | Description                                 |
| ------------------------------------- | ------------------------------------------- |
| `cpu`\*<br/>`pulumi.Input<number>`    | ECS task CPU units. `1024` equals one vCPU. |
| `memory`\*<br/>`pulumi.Input<number>` | ECS task memory in MiB.                     |

Predefined presets:

| Value       | CPU    | Memory  |
| ----------- | ------ | ------- |
| `'small'`   | `256`  | `512`   |
| `'medium'`  | `512`  | `1024`  |
| `'large'`   | `1024` | `2048`  |
| `'xlarge'`  | `2048` | `4096`  |
| `'2xlarge'` | `4096` | `8192`  |
| `'3xlarge'` | `8192` | `16384` |

**Helper Methods**

**`EcsService.createTcpPortMapping`**

```ts
EcsService.createTcpPortMapping(
  port: pulumi.Input<number>,
): aws.ecs.PortMapping
```

Returns a TCP port mapping with matching `containerPort` and `hostPort` values and `protocol: 'tcp'`.
