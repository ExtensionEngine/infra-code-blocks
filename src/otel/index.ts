import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as yaml from 'yaml';
import { EcsService } from '../components/ecs-service';
import { OTLPReceiver } from './otlp-receiver';
import { BatchProcessor } from './batch-processor';
import { MemoryLimiterProcessor } from './memory-limiter-processor';
import { PrometheusRemoteWriteExporter } from './prometheus-remote-write-exporter';

export namespace OtelCollector {
  export type Receiver = {
    otlp?: OTLPReceiver.Config;
  };
  export type ReceiverType = keyof Receiver;

  export type Processor = {
    batch?: BatchProcessor.Config;
    memory_limiter?: MemoryLimiterProcessor.Config;
  } & {
    [name: string]: BatchProcessor.Config;
  };
  export type ProcessorType = keyof Processor;

  export type AwsXRayExporterConfig = {
    region: string;
    endpoint?: string;
  };

  export type AwsCloudWatchLogsExporterConfig = {
    region: string;
    log_group_name: pulumi.Input<string>;
    log_stream_name: pulumi.Input<string>;
    log_retention?: number;
  };

  export type DebugExportedConfig = {
    verbosity: string;
  };

  export type Exporter = {
    prometheusremotewrite?: PrometheusRemoteWriteExporter.Config;
    awsxray?: AwsXRayExporterConfig;
    debug?: DebugExportedConfig;
    awscloudwatchlogs?: AwsCloudWatchLogsExporterConfig;
  };
  export type ExporterType = keyof Exporter;

  export type SigV4AuthExtensionConfig = {
    region: string;
    service: string;
  };

  export type HealthCheckExtensionConfig = {
    endpoint: string;
  };

  export type PprofExtensionConfig = {
    endpoint: string;
  };

  export type Extension = {
    sigv4auth?: SigV4AuthExtensionConfig;
    health_check?: HealthCheckExtensionConfig;
    pprof?: PprofExtensionConfig;
  };
  export type ExtensionType = keyof Extension;

  export type PipelineConfig = {
    receivers: ReceiverType[];
    processors: ProcessorType[];
    exporters: ExporterType[];
  };

  export type TelemetryConfig = {
    logs?: {
      level: string;
    };
    metrics?: {
      level: string;
    };
  };

  export type Service = {
    pipelines: {
      metrics?: PipelineConfig;
      traces?: PipelineConfig;
      logs?: PipelineConfig;
    };
    extensions?: ExtensionType[];
    telemetry?: TelemetryConfig;
  };

  export type Config = {
    receivers: Receiver;
    processors: Processor;
    exporters: Exporter;
    extensions: Extension;
    service: Service;
  };

  export type Opts = {
    containerName?: pulumi.Input<string>;
    configVolumeName?: pulumi.Input<string>;
    taskRoleInlinePolicies?: pulumi.Input<
      pulumi.Input<EcsService.RoleInlinePolicy>[]
    >;
  };
}

export class OtelCollector {
  config: pulumi.Output<OtelCollector.Config>;
  configVolume: pulumi.Output<string>;
  container: pulumi.Output<EcsService.Container>;
  configContainer: EcsService.Container;
  taskRoleInlinePolicies: OtelCollector.Opts['taskRoleInlinePolicies'];

  constructor(
    serviceName: pulumi.Input<string>,
    env: pulumi.Input<string>,
    config: pulumi.Input<OtelCollector.Config>,
    opts: OtelCollector.Opts = {},
  ) {
    const containerName =
      opts.containerName || pulumi.interpolate`${serviceName}-otel-collector`;
    const configVolumeName =
      opts.configVolumeName || 'otel-collector-config-volume';
    this.configVolume = pulumi.output(configVolumeName);
    this.taskRoleInlinePolicies = opts.taskRoleInlinePolicies || [];

    this.config = pulumi.output(config);
    this.configContainer = this.createConfigContainer(
      this.config,
      configVolumeName,
    );
    this.container = this.createContainer(
      containerName,
      this.config,
      configVolumeName,
      serviceName,
      env,
    );
  }

  private createContainer(
    containerName: pulumi.Input<string>,
    config: pulumi.Output<OtelCollector.Config>,
    configVolumeName: pulumi.Input<string>,
    serviceName: pulumi.Input<string>,
    env: pulumi.Input<string>,
  ): pulumi.Output<EcsService.Container> {
    return pulumi
      .all([containerName, config, configVolumeName, serviceName, env])
      .apply(([containerName, config, configVolumeName, serviceName, env]) => ({
        name: containerName,
        image: 'otel/opentelemetry-collector-contrib:0.123.0',
        portMappings: this.getCollectorPortMappings(config),
        mountPoints: [
          {
            sourceVolume: configVolumeName,
            containerPath: '/etc/otelcol-contrib',
            readOnly: true,
          },
        ],
        dependsOn: [
          {
            containerName: this.configContainer.name,
            condition: 'COMPLETE',
          },
        ],
        environment: this.getCollectorEnvironment(serviceName, env),
      }));
  }

  private getCollectorEnvironment(
    serviceName: string,
    env: string,
  ): { name: string; value: string }[] {
    return [
      {
        name: 'OTEL_RESOURCE_ATTRIBUTES',
        value: `service.name=${serviceName},env=${env}`,
      },
    ];
  }

  private getCollectorPortMappings(
    config: OtelCollector.Config,
  ): EcsService.Container['portMappings'] {
    const hasOTLPGRpcReceiver = !!config.receivers.otlp?.protocols.grpc;
    const hasOTLPHttpReceiver = !!config.receivers.otlp?.protocols.http;
    const protocol: aws.ecs.Protocol = 'tcp';

    return [
      ...(hasOTLPGRpcReceiver
        ? [{ containerPort: 4317, hostPort: 4317, protocol }]
        : []),
      ...(hasOTLPHttpReceiver
        ? [{ containerPort: 4318, hostPort: 4318, protocol }]
        : []),
      // TODO: Expose 8888 for collector telemetry
      { containerPort: 13133, hostPort: 13133, protocol },
    ];
  }

  private createConfigContainer(
    config: pulumi.Output<OtelCollector.Config>,
    volume: pulumi.Input<string>,
  ): EcsService.Container {
    return {
      name: 'otel-config-writer',
      image: 'amazonlinux:latest',
      essential: false,
      command: config.apply(config => [
        'sh',
        '-c',
        `echo '${yaml.stringify(config)}' > /etc/otelcol-contrib/config.yaml`,
      ]),
      mountPoints: [
        {
          sourceVolume: volume,
          containerPath: '/etc/otelcol-contrib',
        },
      ],
    };
  }
}
