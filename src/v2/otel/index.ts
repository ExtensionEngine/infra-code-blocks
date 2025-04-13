import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as yaml from 'yaml';
import { EcsService } from '../components/ecs-service';

export namespace OtelCollector {
  export type ReceiverType = 'otlp';
  export type ReceiverProtocol = 'http' | 'grpc';
  export type ReceiverConfig = {
    protocols: {
      [K in ReceiverProtocol]?: {
        endpoint: string;
      };
    };
  };
  export type Receiver = {
    [K in ReceiverType]?: ReceiverConfig;
  };

  export type ProcessorType = 'batch' | 'memory_limiter';
  export type BatchProcessorConfig = {
    send_batch_size: number;
    send_batch_max_size: number;
    timeout: string;
  };
  export type MemoryLimiterProcessorConfig = {
    check_interval: string;
    limit_percentage: number;
    spike_limit_percentage: number;
  };
  export type Processor = {
    batch?: BatchProcessorConfig;
    memory_limiter?: MemoryLimiterProcessorConfig;
  };

  export type ExporterType = 'prometheusremotewrite' | 'awsxray' | 'debug';
  export type PrometheusRemoteWriteExporterConfig = {
    namespace: string;
    endpoint: string;
    auth?: {
      authenticator: string;
    };
  };

  export type AwsXRayExporterConfig = {
    region: string;
  };

  export type DebugExportedConfig = {
    verbosity: string;
  };

  export type Exporter = {
    prometheusremotewrite?: PrometheusRemoteWriteExporterConfig;
    awsxray?: AwsXRayExporterConfig;
    debug?: DebugExportedConfig;
  };

  export type ExtensionType = 'sigv4auth' | 'health_check' | 'pprof';
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
  }

  export type Args = {
    containerName: pulumi.Input<string>;
    serviceName: pulumi.Input<string>;
    env: pulumi.Input<string>;
    config: pulumi.Input<OtelCollector.Config>;
    configVolumeName: pulumi.Input<string>;
  };
}

export class OtelCollector {
  container: pulumi.Output<EcsService.Container>;
  configContainer: EcsService.Container;

  constructor({
    containerName,
    serviceName,
    env,
    config,
    configVolumeName,
  }: OtelCollector.Args) {
    this.configContainer = this.createConfigContainer(
      config,
      configVolumeName
    );

    this.container = this.createContainer(
      containerName,
      config,
      configVolumeName,
      serviceName,
      env
    );
  }

  private createContainer(
    containerName: pulumi.Input<string>,
    config: pulumi.Input<OtelCollector.Config>,
    configVolumeName: pulumi.Input<string>,
    serviceName: pulumi.Input<string>,
    env: pulumi.Input<string>
  ): pulumi.Output<EcsService.Container> {
    return pulumi.all([
      containerName,
      config,
      configVolumeName,
      serviceName,
      env
    ]).apply(([
      containerName,
      config,
      configVolumeName,
      serviceName,
      env
    ]) => ({
      name: containerName,
      image: 'otel/opentelemetry-collector-contrib:latest',
      portMappings: this.getCollectorPortMappings(config),
      mountPoints: [{
        sourceVolume: configVolumeName,
        containerPath: '/etc/otelcol-contrib',
        readOnly: true
      }],
      dependsOn: [{
        containerName: this.configContainer.name,
        condition: 'COMPLETE'
      }],
      environment: this.getCollectorEnvironment(serviceName, env)
    }));
  }

  private getCollectorEnvironment(
    serviceName: string,
    env: string,
  ): { name: string; value: string; }[] {
    return [{
      name: 'OTEL_RESOURCE_ATTRIBUTES',
      value: `service.name=${serviceName},env=${env}`
    },];
  }

  private getCollectorPortMappings(
    config: OtelCollector.Config
  ): EcsService.Container['portMappings'] {
    const hasOTLPGRpcReceiver = !!config.receivers.otlp?.protocols.grpc;
    const hasOTLPHttpReceiver = !!config.receivers.otlp?.protocols.http;
    const protocol: aws.ecs.Protocol = 'tcp';

    return [
      ...(hasOTLPGRpcReceiver ? [{ containerPort: 4317, hostPort: 4317, protocol }] : []),
      ...(hasOTLPHttpReceiver ? [{ containerPort: 4318, hostPort: 4318, protocol }] : []),
      // TODO: Expose 8888 for collector telemetry
      { containerPort: 13133, hostPort: 13133, protocol },
    ];
  }

  private createConfigContainer(
    config: pulumi.Input<OtelCollector.Config>,
    volume: pulumi.Input<string>
  ): EcsService.Container {
    return {
      name: 'otel-config-writer',
      image: 'amazonlinux:latest',
      essential: false,
      command: [
        'sh', '-c',
        pulumi.interpolate`echo '${yaml.stringify(config)}' > /etc/otelcol-contrib/config.yaml`],
      mountPoints: [{
        sourceVolume: volume,
        containerPath: '/etc/otelcol-contrib',
      }]
    }
  }
}
