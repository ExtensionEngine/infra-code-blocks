# `src/otel`

The `openTelemetry` namespace provides package-standard OpenTelemetry collector sidecar helpers for ECS-based application components.

Use it to render collector configuration into ECS init/sidecar containers, shared config volume settings, OTLP ports, resource attributes, and task-role IAM policy fragments that components such as `WebServer` can attach to application tasks.

## Usage examples

### Happy path

```ts
import * as studion from '@studion/infra-code-blocks';

const collector = new studion.openTelemetry.OtelCollectorBuilder('app', 'dev')
  .withOTLPReceiver(['http'])
  .withDebug('basic')
  .withTracesPipeline(['otlp'], [], ['debug'])
  .build();

export const collectorConfigVolume = collector.configVolume;
```

### Non-trivial scenario

```ts
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as studion from '@studion/infra-code-blocks';

const env = pulumi.getStack();
const vpc = new studion.Vpc('app');
const cluster = new aws.ecs.Cluster('app-cluster', {});
const logGroup = new aws.cloudwatch.LogGroup('otel-logs', {
  retentionInDays: 7,
});
const workspace = new aws.amp.Workspace('otel-amp', {});

const collector = new studion.openTelemetry.OtelCollectorBuilder('api', env)
  .withDefault({
    prometheusNamespace: 'api',
    prometheusWorkspace: workspace,
    region: aws.config.requireRegion(),
    logGroup,
    logStreamName: 'api-stream',
  })
  .build();

const webServer = new studion.WebServerBuilder('api')
  .withContainer('nginx:stable', 8080, {
    environment: [
      { name: 'OTEL_SERVICE_NAME', value: 'api' },
      { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', value: 'http://127.0.0.1:4318' },
      { name: 'OTEL_EXPORTER_OTLP_PROTOCOL', value: 'http/json' },
    ],
  })
  .withEcsConfig({
    cluster,
    desiredCount: 2,
    size: 'medium',
    autoscaling: {
      enabled: true,
      minCount: 2,
      maxCount: 4,
    },
  })
  .withVpc(vpc.vpc)
  .withOtelCollector(collector)
  .build();

export const collectorPolicies = collector.taskRoleInlinePolicies;
export const webServerName = webServer.name;
```

## Implementation notes

- `OtelCollector` does not create Pulumi resources directly; it produces ECS container configuration objects, a shared config volume name, and IAM inline policy objects for a parent ECS component to consume.
- The collector sidecar image is fixed to `otel/opentelemetry-collector-contrib:0.123.0`.
- The init container is always named `otel-config-writer`, uses `amazonlinux:latest`, is marked `essential: false`, and writes YAML with `sh -c` plus `echo '...' > /etc/otelcol-contrib/config.yaml`. Because the YAML is embedded in a single-quoted shell command, direct `OtelCollector` config values should avoid unescaped single quotes or other shell-sensitive content until the writer escapes YAML explicitly.
- The collector sidecar mounts the config volume read-only at `/etc/otelcol-contrib`, depends on the config-writer container completing successfully, and sets `OTEL_RESOURCE_ATTRIBUTES` to `service.name=<serviceName>,env=<env>`.
- The collector config volume defaults to `'otel-collector-config-volume'`, and the collector container name defaults to `${serviceName}-otel-collector`.
- The collector sidecar always exposes port `13133` for health checks. Ports `4317` and `4318` are exposed only when the OTLP receiver enables `grpc` and `http`, respectively.
- Collector self-telemetry port `8888` is explicitly not exposed.
- `OtelCollectorBuilder.withDefault()` wires HTTP OTLP reception, a memory limiter, three named batch processors (`batch/metrics`, `batch/traces`, `batch/logs`), AMP remote write with SigV4 auth, AWS X-Ray export, CloudWatch Logs export, a health-check extension, metrics/traces/logs pipelines, and default telemetry settings.
- `OtelCollectorBuilder` appends task-role IAM policies only when you call `withAPS()`, `withAWSXRayExporter()`, `withCloudWatchLogsExporter()`, or `withDefault()`; `withDebug()`, `withTelemetry()`, and extension methods only affect collector YAML.
- The config builder validates that every receiver, processor, and exporter named in a pipeline has been defined, and that `memory_limiter` is not placed after another processor in any pipeline.
- The source tree contains `OtelCollectorConfigBuilder` in `src/otel/config.ts`, and `OtelCollectorBuilder` relies on it internally to assemble and validate collector config. It is an internal implementation detail and is not exported through `@studion/infra-code-blocks`, so end consumers should treat `openTelemetry.OtelCollector`, `openTelemetry.OtelCollectorBuilder`, and `openTelemetry.OtelCollector.Config` as the supported public surface.

## API Reference

### `openTelemetry`

**Exported Members**

| Export                 | Kind  | Signature reference                                                                   |
| ---------------------- | ----- | ------------------------------------------------------------------------------------- |
| `OtelCollector`        | class | See [`openTelemetry.OtelCollector`](#opentelemetryotelcollector) below.               |
| `OtelCollectorBuilder` | class | See [`openTelemetry.OtelCollectorBuilder`](#opentelemetryotelcollectorbuilder) below. |

### `openTelemetry.OtelCollector`

**Signature**

```ts
class OtelCollector {
  constructor(
    serviceName: pulumi.Input<string>,
    env: pulumi.Input<string>,
    config: pulumi.Input<OtelCollector.Config>,
    opts?: OtelCollector.Opts,
  );
}
```

**Constructor parameters**

| Parameter                                           | Description                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `serviceName`\*<br/>`pulumi.Input<string>`          | Service name embedded into collector resource attributes and default container naming.          |
| `env`\*<br/>`pulumi.Input<string>`                  | Environment value embedded into collector resource attributes.                                  |
| `config`\*<br/>`pulumi.Input<OtelCollector.Config>` | Full collector configuration object rendered into `config.yaml`.                                |
| `opts`<br/>`OtelCollector.Opts`                     | Optional container naming, config-volume naming, and task-role policy fragments. Default: `{}`. |

**Configuration Options**

Direct constructor input: `config: OtelCollector.Config`

| Property                                     | Description                                |
| -------------------------------------------- | ------------------------------------------ |
| `receivers`\*<br/>`OtelCollector.Receiver`   | Receiver definitions keyed by name.        |
| `processors`\*<br/>`OtelCollector.Processor` | Processor definitions keyed by name.       |
| `exporters`\*<br/>`OtelCollector.Exporter`   | Exporter definitions keyed by name.        |
| `extensions`\*<br/>`OtelCollector.Extension` | Extension definitions keyed by name.       |
| `service`\*<br/>`OtelCollector.Service`      | Pipeline, extension, and telemetry wiring. |

Direct constructor input: `opts: OtelCollector.Opts`

| Property                                                                                 | Description                                                                             |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `containerName`<br/>`pulumi.Input<string>`                                               | Collector sidecar container name. Default: `${serviceName}-otel-collector`.             |
| `configVolumeName`<br/>`pulumi.Input<string>`                                            | Shared ECS volume that stores `config.yaml`. Default: `'otel-collector-config-volume'`. |
| `taskRoleInlinePolicies`<br/>`pulumi.Input<pulumi.Input<EcsService.RoleInlinePolicy>[]>` | IAM policies exposed to the consuming ECS layer. Default: `[]`.                         |

**Outputs**

| Property                                                                                 | Description                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `config`<br/>`pulumi.Output<OtelCollector.Config>`                                       | Collector config object that will be rendered to YAML.       |
| `configVolume`<br/>`pulumi.Output<string>`                                               | Shared ECS volume name used for `config.yaml`.               |
| `container`<br/>`pulumi.Output<EcsService.Container>`                                    | Collector sidecar container definition.                      |
| `configContainer`<br/>`EcsService.Container`                                             | Init container definition that writes `config.yaml`.         |
| `taskRoleInlinePolicies`<br/>`pulumi.Input<pulumi.Input<EcsService.RoleInlinePolicy>[]>` | IAM policy fragments exposed to the consuming ECS component. |

**Generated Artifacts**

| Artifact                                                     | Description                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Collector config YAML<br/>file written by init container     | Written to `/etc/otelcol-contrib/config.yaml` from `yaml.stringify(config)`. |
| OTLP gRPC listener<br/>TCP port mapping                      | Present only when `config.receivers.otlp.protocols.grpc` is defined.         |
| OTLP HTTP listener<br/>TCP port mapping                      | Present only when `config.receivers.otlp.protocols.http` is defined.         |
| Health-check listener<br/>TCP port mapping                   | Always present on the collector container at port `13133`.                   |
| AMP IAM policy<br/>`EcsService.RoleInlinePolicy`             | Added by `withAPS()` or `withDefault()`.                                     |
| X-Ray IAM policy<br/>`EcsService.RoleInlinePolicy`           | Added by `withAWSXRayExporter()` or `withDefault()`.                         |
| CloudWatch Logs IAM policy<br/>`EcsService.RoleInlinePolicy` | Added by `withCloudWatchLogsExporter()` or `withDefault()`.                  |

**Supporting Types**

**`OtelCollector.Receiver`**

```ts
type Receiver = {
  otlp?: OTLPReceiver.Config;
};
```

Defines the supported receiver keys for `config.receivers`.

**`OTLPReceiver.Config`**

```ts
type Config = {
  protocols: {
    [K in OTLPReceiver.Protocol]?: {
      endpoint: string;
    };
  };
};
```

| Property                                                                    | Description                           |
| --------------------------------------------------------------------------- | ------------------------------------- |
| `protocols`\*<br/>`{ [K in OTLPReceiver.Protocol]?: { endpoint: string } }` | Per-protocol OTLP listener endpoints. |

Supported protocol keys and source defaults:

- `http` - exposes collector port `4318`, defaults to `'0.0.0.0:4318'`.
- `grpc` - exposes collector port `4317`, defaults to `'0.0.0.0:4317'`.

**`OtelCollector.Processor`**

```ts
type Processor = {
  batch?: BatchProcessor.Config;
  memory_limiter?: MemoryLimiterProcessor.Config;
} & {
  [name: string]: BatchProcessor.Config;
};
```

| Property                                             | Description                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `batch`<br/>`BatchProcessor.Config`                  | Conventional default batch processor key.                                    |
| `memory_limiter`<br/>`MemoryLimiterProcessor.Config` | Must be first in a pipeline when referenced.                                 |
| `[name: string]`<br/>`BatchProcessor.Config`         | Additional named batch processors such as `batch/metrics` or `batch/traces`. |

**`BatchProcessor.Config`**

```ts
type Config = {
  send_batch_size: number;
  send_batch_max_size: number;
  timeout: string;
};
```

| Property                             | Description                    |
| ------------------------------------ | ------------------------------ |
| `send_batch_size`\*<br/>`number`     | Batch send size.               |
| `send_batch_max_size`\*<br/>`number` | Maximum batch send size.       |
| `timeout`\*<br/>`string`             | OpenTelemetry duration string. |

**`MemoryLimiterProcessor.Config`**

```ts
type Config = {
  check_interval: string;
  limit_percentage: number;
  spike_limit_percentage: number;
};
```

| Property                                | Description                    |
| --------------------------------------- | ------------------------------ |
| `check_interval`\*<br/>`string`         | OpenTelemetry duration string. |
| `limit_percentage`\*<br/>`number`       | Soft memory limit percentage.  |
| `spike_limit_percentage`\*<br/>`number` | Spike buffer percentage.       |

**`OtelCollector.Exporter`**

```ts
type Exporter = {
  prometheusremotewrite?: PrometheusRemoteWriteExporter.Config;
  awsxray?: OtelCollector.AwsXRayExporterConfig;
  debug?: OtelCollector.DebugExportedConfig;
  awscloudwatchlogs?: OtelCollector.AwsCloudWatchLogsExporterConfig;
};
```

| Property                                                                | Description                           |
| ----------------------------------------------------------------------- | ------------------------------------- |
| `prometheusremotewrite`<br/>`PrometheusRemoteWriteExporter.Config`      | AMP-compatible remote-write exporter. |
| `awsxray`<br/>`OtelCollector.AwsXRayExporterConfig`                     | AWS X-Ray exporter.                   |
| `debug`<br/>`OtelCollector.DebugExportedConfig`                         | Debug exporter.                       |
| `awscloudwatchlogs`<br/>`OtelCollector.AwsCloudWatchLogsExporterConfig` | CloudWatch Logs exporter.             |

**`PrometheusRemoteWriteExporter.Config`**

```ts
type Config = {
  namespace: pulumi.Input<string>;
  endpoint: pulumi.Input<string>;
  auth?: {
    authenticator: pulumi.Input<string>;
  };
};
```

| Property                                             | Description                                    |
| ---------------------------------------------------- | ---------------------------------------------- |
| `namespace`\*<br/>`pulumi.Input<string>`             | Namespace written into remote-write samples.   |
| `endpoint`\*<br/>`pulumi.Input<string>`              | Full remote-write endpoint.                    |
| `auth`<br/>`{ authenticator: pulumi.Input<string> }` | `withAPS()` sets `authenticator: 'sigv4auth'`. |

**`OtelCollector.AwsXRayExporterConfig`**

```ts
type AwsXRayExporterConfig = {
  region: string;
  endpoint?: string;
};
```

| Property                | Description                 |
| ----------------------- | --------------------------- |
| `region`\*<br/>`string` | AWS region.                 |
| `endpoint`<br/>`string` | Optional endpoint override. |

**`OtelCollector.AwsCloudWatchLogsExporterConfig`**

```ts
type AwsCloudWatchLogsExporterConfig = {
  region: string;
  log_group_name: pulumi.Input<string>;
  log_stream_name: pulumi.Input<string>;
  log_retention: pulumi.Input<number | undefined>;
};
```

| Property                                                  | Description                                            |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `region`\*<br/>`string`                                   | AWS region.                                            |
| `log_group_name`\*<br/>`pulumi.Input<string>`             | Destination log group name.                            |
| `log_stream_name`\*<br/>`pulumi.Input<string>`            | Destination log stream name.                           |
| `log_retention`\*<br/>`pulumi.Input<number \| undefined>` | Retention value passed through to the exporter config. |

**`OtelCollector.DebugExportedConfig`**

```ts
type DebugExportedConfig = {
  verbosity: string;
};
```

| Property                   | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| `verbosity`\*<br/>`string` | Builder helpers constrain this to `'normal'`, `'basic'`, or `'detailed'`. |

**`OtelCollector.Extension`**

```ts
type Extension = {
  sigv4auth?: OtelCollector.SigV4AuthExtensionConfig;
  health_check?: OtelCollector.HealthCheckExtensionConfig;
  pprof?: OtelCollector.PprofExtensionConfig;
};
```

| Property                                                      | Description                       |
| ------------------------------------------------------------- | --------------------------------- |
| `sigv4auth`<br/>`OtelCollector.SigV4AuthExtensionConfig`      | Used by the AMP exporter helper.  |
| `health_check`<br/>`OtelCollector.HealthCheckExtensionConfig` | Collector health-check extension. |
| `pprof`<br/>`OtelCollector.PprofExtensionConfig`              | `pprof` extension.                |

**`OtelCollector.SigV4AuthExtensionConfig`**

```ts
type SigV4AuthExtensionConfig = {
  region: string;
  service: string;
};
```

| Property                 | Description       |
| ------------------------ | ----------------- |
| `region`\*<br/>`string`  | AWS region.       |
| `service`\*<br/>`string` | AWS service name. |

**`OtelCollector.HealthCheckExtensionConfig`**

```ts
type HealthCheckExtensionConfig = {
  endpoint: string;
};
```

| Property                  | Description                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `endpoint`\*<br/>`string` | Health-check bind address. Default: `'0.0.0.0:13133'` when added through builder helpers. |

**`OtelCollector.PprofExtensionConfig`**

```ts
type PprofExtensionConfig = {
  endpoint: string;
};
```

| Property                  | Description                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `endpoint`\*<br/>`string` | `pprof` bind address. Default: `'0.0.0.0:1777'` when added through builder helpers. |

**`OtelCollector.Service`**

```ts
type Service = {
  pipelines: {
    metrics?: OtelCollector.PipelineConfig;
    traces?: OtelCollector.PipelineConfig;
    logs?: OtelCollector.PipelineConfig;
  };
  extensions?: OtelCollector.ExtensionType[];
  telemetry?: OtelCollector.TelemetryConfig;
};
```

| Property                                                                                                                                   | Description                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `pipelines`\*<br/>`{ metrics?: OtelCollector.PipelineConfig; traces?: OtelCollector.PipelineConfig; logs?: OtelCollector.PipelineConfig }` | Declares service pipelines.                                 |
| `extensions`<br/>`OtelCollector.ExtensionType[]`                                                                                           | Order follows `Object.keys(this._extensions)` during build. |
| `telemetry`<br/>`OtelCollector.TelemetryConfig`                                                                                            | Collector self-telemetry settings.                          |

**`OtelCollector.PipelineConfig`**

```ts
type PipelineConfig = {
  receivers: ReceiverType[];
  processors: ProcessorType[];
  exporters: ExporterType[];
};
```

| Property                                           | Description                                  |
| -------------------------------------------------- | -------------------------------------------- |
| `receivers`\*<br/>`OtelCollector.ReceiverType[]`   | Every referenced receiver must exist.        |
| `processors`\*<br/>`OtelCollector.ProcessorType[]` | `memory_limiter` must be first when present. |
| `exporters`\*<br/>`OtelCollector.ExporterType[]`   | Every referenced exporter must exist.        |

**`OtelCollector.TelemetryConfig`**

```ts
type TelemetryConfig = {
  logs?: {
    level: string;
  };
  metrics?: {
    level: string;
  };
};
```

| Property                          | Description                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- |
| `logs`<br/>`{ level: string }`    | Builder helpers constrain values to `'debug'`, `'warn'`, or `'error'`.      |
| `metrics`<br/>`{ level: string }` | Builder helpers constrain values to `'basic'`, `'normal'`, or `'detailed'`. |

### `openTelemetry.OtelCollectorBuilder`

**Signature**

```ts
class OtelCollectorBuilder {
  constructor(serviceName: pulumi.Input<string>, env: pulumi.Input<string>);
}
```

**Constructor parameters**

| Parameter                                  | Description                                                           |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `serviceName`\*<br/>`pulumi.Input<string>` | Service name passed to the constructed `OtelCollector` resource.      |
| `env`\*<br/>`pulumi.Input<string>`         | Environment value passed to the constructed `OtelCollector` resource. |

**Builder Methods**

| Method                       | Parameters                                                                                                                                                                            | Description                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `withOTLPReceiver`           | `protocols: OTLPReceiver.Protocol[] = ['http']`                                                                                                                                       | Adds an OTLP receiver.                                       |
| `withBatchProcessor`         | `name = 'batch', size = 8192, maxSize = 10000, timeout = '5s'`                                                                                                                        | Adds one batch processor.                                    |
| `withMemoryLimiterProcessor` | `checkInterval = '1s', limitPercentage = 80, spikeLimitPercentage = 15`                                                                                                               | Adds the memory-limiter processor.                           |
| `withAWSXRayExporter`        | `region: string`                                                                                                                                                                      | Adds the AWS X-Ray exporter and an IAM policy.               |
| `withCloudWatchLogsExporter` | `region: OtelCollector.AwsCloudWatchLogsExporterConfig['region'], logGroup: aws.cloudwatch.LogGroup, logStreamName: OtelCollector.AwsCloudWatchLogsExporterConfig['log_stream_name']` | Adds the CloudWatch Logs exporter and an IAM policy.         |
| `withHealthCheckExtension`   | `endpoint = '0.0.0.0:13133'`                                                                                                                                                          | Adds the health-check extension.                             |
| `withPprofExtension`         | `endpoint = '0.0.0.0:1777'`                                                                                                                                                           | Adds the `pprof` extension.                                  |
| `withAPS`                    | `namespace: pulumi.Input<string>, workspace: aws.amp.Workspace, region: string`                                                                                                       | Adds AMP remote-write config, SigV4 auth, and an IAM policy. |
| `withDebug`                  | `verbosity: 'normal' \| 'basic' \| 'detailed' = 'detailed'`                                                                                                                           | Adds the debug exporter.                                     |
| `withTelemetry`              | `logLevel: 'debug' \| 'warn' \| 'error' = 'error', metricsVerbosity: 'basic' \| 'normal' \| 'detailed' = 'basic'`                                                                     | Sets service telemetry config.                               |
| `withMetricsPipeline`        | `receivers: OtelCollector.ReceiverType[], processors: OtelCollector.ProcessorType[], exporters: OtelCollector.ExporterType[]`                                                         | Defines the metrics pipeline.                                |
| `withTracesPipeline`         | `receivers: OtelCollector.ReceiverType[], processors: OtelCollector.ProcessorType[], exporters: OtelCollector.ExporterType[]`                                                         | Defines the traces pipeline.                                 |
| `withLogsPipeline`           | `receivers: OtelCollector.ReceiverType[], processors: OtelCollector.ProcessorType[], exporters: OtelCollector.ExporterType[]`                                                         | Defines the logs pipeline.                                   |
| `withDefault`                | `args: OtelCollectorBuilder.WithDefaultArgs`                                                                                                                                          | Applies the package default AWS-oriented collector setup.    |
| `build`                      | none                                                                                                                                                                                  | Returns an `OtelCollector`.                                  |

**Build Result**

```ts
build(): OtelCollector
```

| Return Type     | Description                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OtelCollector` | Returns an `OtelCollector` from the collected builder state and validates pipeline references plus `memory_limiter` ordering before construction. |

**Supporting Types**

**`OtelCollectorBuilder.WithDefaultArgs`**

```ts
type WithDefaultArgs = {
  prometheusNamespace: PrometheusRemoteWriteExporter.Config['namespace'];
  prometheusWorkspace: aws.amp.Workspace;
  region: string;
  logGroup: aws.cloudwatch.LogGroup;
  logStreamName: OtelCollector.AwsCloudWatchLogsExporterConfig['log_stream_name'];
};
```

| Property                                                                                 | Description                                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `prometheusNamespace`\*<br/>`PrometheusRemoteWriteExporter.Config['namespace']`          | Prefix written into the AMP remote-write exporter config.              |
| `prometheusWorkspace`\*<br/>`aws.amp.Workspace`                                          | Used for remote-write endpoint construction and IAM policy generation. |
| `region`\*<br/>`string`                                                                  | AWS region for exporters and SigV4 auth.                               |
| `logGroup`\*<br/>`aws.cloudwatch.LogGroup`                                               | CloudWatch log group resource.                                         |
| `logStreamName`\*<br/>`OtelCollector.AwsCloudWatchLogsExporterConfig['log_stream_name']` | CloudWatch Logs stream name.                                           |
