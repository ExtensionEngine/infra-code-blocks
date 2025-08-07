import * as pulumi from '@pulumi/pulumi';
import { OTLPReceiver, Protocol } from './otlp-receiver';
import type { OtelCollector } from '.';

export class OtelCollectorConfigBuilder {
  private readonly _receivers: OtelCollector.Receiver = {};
  private readonly _processors: OtelCollector.Processor = {};
  private readonly _exporters: OtelCollector.Exporter = {};
  private readonly _extensions: OtelCollector.Extension = {};
  private readonly _service: OtelCollector.Service = {
    pipelines: {},
  };

  withOTLPReceiver(protocols: OTLPReceiver.Protocol[] = ['http']): this {
    if (!protocols.length) {
      throw new Error('At least one OTLP receiver protocol should be provided');
    }

    const protocolsConfig = protocols.reduce((all, current) => {
      const protocolConfig = Protocol[current];
      if (!protocolConfig) {
        throw new Error(`OTLP receiver protocol ${current} is not supported`);
      }

      return { ...all, [current]: protocolConfig };
    }, {});

    this._receivers.otlp = { protocols: protocolsConfig };

    return this;
  }

  withBatchProcessor(
    name = 'batch',
    size = 8192,
    maxSize = 10000,
    timeout = '5s',
  ): this {
    this._processors[name] = {
      send_batch_size: size,
      send_batch_max_size: maxSize,
      timeout,
    };

    return this;
  }

  withMemoryLimiterProcessor(
    checkInterval = '1s',
    limitPercentage = 80,
    spikeLimitPercentage = 15,
  ): this {
    this._processors.memory_limiter = {
      check_interval: checkInterval,
      limit_percentage: limitPercentage,
      spike_limit_percentage: spikeLimitPercentage,
    };

    return this;
  }

  withAWSXRayExporter(region: string): this {
    this._exporters.awsxray = { region };

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

  withAPS(
    namespace: pulumi.Input<string>,
    endpoint: pulumi.Input<string>,
    region: string,
  ): this {
    this._exporters.prometheusremotewrite = {
      endpoint,
      namespace,
      auth: {
        authenticator: 'sigv4auth',
      },
    };

    this._extensions.sigv4auth = {
      region,
      service: 'aps',
    };

    return this;
  }

  withDebug(verbosity: 'normal' | 'basic' | 'detailed' = 'detailed'): this {
    this._exporters.debug = { verbosity };

    return this;
  }

  withTelemetry(
    logLevel: 'debug' | 'warn' | 'error' = 'error',
    metricsVerbosity: 'basic' | 'normal' | 'detailed' = 'basic',
  ): this {
    this._service.telemetry = {
      logs: { level: logLevel },
      metrics: { level: metricsVerbosity },
    };

    return this;
  }

  withMetricsPipeline(
    receivers: OtelCollector.ReceiverType[],
    processors: OtelCollector.ProcessorType[],
    exporters: OtelCollector.ExporterType[],
  ): this {
    this._service.pipelines.metrics = {
      receivers,
      processors,
      exporters,
    };

    return this;
  }

  withTracesPipeline(
    receivers: OtelCollector.ReceiverType[],
    processors: OtelCollector.ProcessorType[],
    exporters: OtelCollector.ExporterType[],
  ): this {
    this._service.pipelines.traces = {
      receivers,
      processors,
      exporters,
    };

    return this;
  }

  withDefault(
    prometheusNamespace: pulumi.Input<string>,
    prometheusWriteEndpoint: pulumi.Input<string>,
    awsRegion: string,
  ): this {
    return this.withOTLPReceiver(['http'])
      .withMemoryLimiterProcessor()
      .withBatchProcessor('batch/metrics')
      .withBatchProcessor('batch/traces', 2000, 5000, '2s')
      .withAPS(prometheusNamespace, prometheusWriteEndpoint, awsRegion)
      .withAWSXRayExporter(awsRegion)
      .withHealthCheckExtension()
      .withMetricsPipeline(
        ['otlp'],
        ['memory_limiter', 'batch/metrics'],
        ['prometheusremotewrite'],
      )
      .withTracesPipeline(
        ['otlp'],
        ['memory_limiter', 'batch/traces'],
        ['awsxray'],
      )
      .withTelemetry();
  }

  build(): OtelCollector.Config {
    this.validatePipelineComponents('metrics');
    this.validatePipelineComponents('traces');
    this.validatePipelineProcessorOrder('metrics');
    this.validatePipelineProcessorOrder('traces');

    // FIX: Fix type inference
    const extensions = Object.keys(
      this._extensions,
    ) as OtelCollector.ExtensionType[];
    if (extensions.length) {
      this._service.extensions = extensions;
    }

    // TODO: Add schema validation (non-empty receivers, non-empty receiver protocols)
    return {
      receivers: this._receivers,
      processors: this._processors,
      exporters: this._exporters,
      extensions: this._extensions,
      service: this._service,
    };
  }

  private validatePipelineProcessorOrder(
    pipelineType: 'metrics' | 'traces',
  ): void {
    const pipeline = this._service.pipelines[pipelineType];
    if (!pipeline) return;

    const { processors } = pipeline;
    const memoryLimiterIndex = processors.findIndex(
      processor => processor === 'memory_limiter',
    );
    if (memoryLimiterIndex > 0) {
      throw new Error(
        `memory_limiter processor is not the first processor in the ${pipelineType} pipeline.`,
      );
    }
  }

  private validatePipelineComponents(pipelineType: 'metrics' | 'traces'): void {
    this._service.pipelines[pipelineType]?.receivers.forEach(receiver => {
      if (!this._receivers[receiver]) {
        throw new Error(
          `Receiver '${receiver}' is used in ${pipelineType} pipeline but not defined`,
        );
      }
    });

    this._service.pipelines[pipelineType]?.processors.forEach(processor => {
      if (!this._processors[processor]) {
        throw new Error(
          `Processor '${processor}' is used in ${pipelineType} pipeline but not defined`,
        );
      }
    });

    this._service.pipelines[pipelineType]?.exporters.forEach(exporter => {
      if (!this._exporters[exporter]) {
        throw new Error(
          `Exporter '${exporter}' is used in ${pipelineType} pipeline but not defined`,
        );
      }
    });
  }
}
