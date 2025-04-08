import * as yaml from 'yaml';

export namespace OtelCollectorConfigBuilder {
  export type ReceiverType = 'otlp';
  export type ReceiverProtocol = 'http' | 'rpc';
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
}

const OTLPReceiverProtocols = {
  rpc: {
    endpoint: '0.0.0.0:4317'
  },
  http: {
    endpoint: '0.0.0.0:4318'
  }
};

export class OtelCollectorConfigBuilder {
  private readonly _receivers: OtelCollectorConfigBuilder.Receiver = {};
  private readonly _processors: OtelCollectorConfigBuilder.Processor = {};
  private readonly _exporters: OtelCollectorConfigBuilder.Exporter = {};
  private readonly _extensions: OtelCollectorConfigBuilder.Extension = {};
  private readonly _service: OtelCollectorConfigBuilder.Service = {
    pipelines: {}
  };

  withOTLPReceiver(
    protocols: OtelCollectorConfigBuilder.ReceiverProtocol[] = ['http']
  ): this {
    if (!protocols.length) {
      throw new Error('At least one OTLP receiver protocol should be provided');
    }

    const protocolsConfig = protocols.reduce((all, current) => {
      const protocolConfig = OTLPReceiverProtocols[current];
      if (!protocolConfig) {
        throw new Error(`OTLP receiver protocol ${current} is not supported`);
      }

      return { ...all, [current]: protocolConfig }
    }, {});

    this._receivers.otlp = { protocols: protocolsConfig };

    return this;
  }

  withBatchProcessor(
    size = 8192,
    maxSize = 10000,
    timeout = '5s'
  ): this {
    this._processors.batch = {
      'send_batch_size': size,
      'send_batch_max_size': maxSize,
      timeout
    };

    return this;
  }

  withMemoryLimiterProcessor(
    checkInterval = '5s',
    limitPercentage = 80,
    spikeLimitPercentage = 25
  ): this {
    this._processors.memory_limiter = {
      check_interval: checkInterval,
      limit_percentage: limitPercentage,
      spike_limit_percentage: spikeLimitPercentage
    };

    return this;
  }

  withPrometheusRemoteWriteExporter(
    namespace: string,
    endpoint: string
  ): this {
    this._exporters.prometheusremotewrite = {
      namespace,
      endpoint,
      auth: { authenticator: 'sigv4auth' }
    };

    return this;
  }

  withAWSXRayExporter(region: string): this {
    this._exporters.awsxray = { region };

    return this;
  }

  withSigV4AuthExtension(region: string): this {
    this._extensions.sigv4auth = {
      region,
      service: 'aps'
    };

    return this;
  }

  withHealthCheckExtension(endpoint = '0.0.0.0:13133'): this {
    this._extensions.health_check = { endpoint };

    return this;
  }

  withPprofExtension(endpoint = '0.0.0.0:1777'): this {
    this._extensions.pprof = { endpoint };

    return this;
  }

  withAPS(namespace: string, endpoint: string, region: string): this {
    this._exporters.prometheusremotewrite = {
      endpoint,
      namespace,
      auth: {
        authenticator: 'sigv4auth'
      }
    };

    this._extensions.sigv4auth = {
      region,
      service: 'aps'
    };

    return this;
  }

  withDebug(verbosity: 'normal' | 'basic' | 'detailed' = 'detailed'): this {
    this._exporters.debug = { verbosity };

    return this;
  }

  withTelemetry(
    logLevel: 'debug' | 'warn' | 'error' = 'error',
    metricsVerbosity: 'basic' | 'normal' | 'detailed' = 'basic'
  ): this {
    this._service.telemetry = {
      logs: { level: logLevel },
      metrics: { level: metricsVerbosity }
    };

    return this;
  }

  withMetricsPipeline(
    receivers: OtelCollectorConfigBuilder.ReceiverType[],
    processors: OtelCollectorConfigBuilder.ProcessorType[],
    exporters: OtelCollectorConfigBuilder.ExporterType[],
  ): this {
    this._service.pipelines.metrics = {
      receivers,
      processors,
      exporters
    };

    return this;
  }

  withTracesPipeline(
    receivers: OtelCollectorConfigBuilder.ReceiverType[],
    processors: OtelCollectorConfigBuilder.ProcessorType[],
    exporters: OtelCollectorConfigBuilder.ExporterType[],
  ): this {
    this._service.pipelines.traces = {
      receivers,
      processors,
      exporters
    };

    return this;
  }

  build(): string {
    this.validatePipelineComponents('metrics');
    this.validatePipelineComponents('traces');

    // FIX: Fix type inference
    const extensions = Object.keys(
      this._extensions
    ) as OtelCollectorConfigBuilder.ExtensionType[];
    if (extensions.length) {
      this._service.extensions = extensions;
    }

    // TODO: Add schema validation (non-empty receivers, non-empty receiver protocols)
    return yaml.stringify({
      receivers: this._receivers,
      processors: this._processors,
      exporters: this._exporters,
      extensions: this._extensions,
      service: this._service
    });
  }

  private validatePipelineComponents(pipelineType: 'metrics' | 'traces'): void {
    this._service.pipelines[pipelineType]?.receivers.forEach(receiver => {
      if (!this._receivers[receiver]) {
        throw new Error(`Receiver '${receiver}' is used in ${pipelineType} pipeline but not defined`);
      }
    });

    this._service.pipelines[pipelineType]?.processors.forEach(processor => {
      if (!this._processors[processor]) {
        throw new Error(`Processor '${processor}' is used in ${pipelineType} pipeline but not defined`);
      }
    });

    this._service.pipelines[pipelineType]?.exporters.forEach(exporter => {
      if (!this._exporters[exporter]) {
        throw new Error(`Exporter '${exporter}' is used in ${pipelineType} pipeline but not defined`);
      }
    });
  }
}
