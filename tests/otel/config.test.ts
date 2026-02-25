import { it } from 'node:test';
import * as assert from 'node:assert';
import { OtelCollectorConfigBuilder } from '../../src/otel/config';

const awsRegion = 'us-west-2';
const prometheusNamespace = 'test-namespace';
const prometheusEndpoint =
  'https://aps-workspaces.us-west-2.amazonaws.com/workspaces/ws-12345/api/v1/remote_write';
const logGroupName = 'cw-test-lg';
const logStreamName = 'cw-test-ls';
const logRetention = 7;

const defaultMemoryLimiterConfig = {
  check_interval: '1s',
  limit_percentage: 80,
  spike_limit_percentage: 15,
};
const defaultBatchConfig = {
  send_batch_size: 8192,
  send_batch_max_size: 10000,
  timeout: '5s',
};

export function testOtelConfigBuilder() {
  it('should generate minimal configuration with OTLP receiver and debug exporter', () => {
    const result = new OtelCollectorConfigBuilder()
      .withOTLPReceiver(['http'])
      .withDebug()
      .build();

    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' },
          },
        },
      },
      processors: {},
      exporters: {
        debug: { verbosity: 'detailed' },
      },
      extensions: {},
      service: { pipelines: {} },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should configure batch processor', () => {
    const result = new OtelCollectorConfigBuilder()
      .withBatchProcessor()
      .build();

    const expected = {
      receivers: {},
      processors: {
        batch: defaultBatchConfig,
      },
      exporters: {},
      extensions: {},
      service: { pipelines: {} },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should configure memory limiter processor', () => {
    const result = new OtelCollectorConfigBuilder()
      .withMemoryLimiterProcessor()
      .build();

    const expected = {
      receivers: {},
      processors: {
        memory_limiter: defaultMemoryLimiterConfig,
      },
      exporters: {},
      extensions: {},
      service: { pipelines: {} },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('withBatchProcessor should use provided parameters', () => {
    const result = new OtelCollectorConfigBuilder()
      .withBatchProcessor('batch', 5000, 8000, '10s')
      .build();

    assert.deepStrictEqual(result.processors.batch, {
      send_batch_size: 5000,
      send_batch_max_size: 8000,
      timeout: '10s',
    });
  });

  it('withMemoryLimiterProcessor should use provided parameters', () => {
    const result = new OtelCollectorConfigBuilder()
      .withMemoryLimiterProcessor('3s', 70, 15)
      .build();

    assert.deepStrictEqual(result.processors.memory_limiter, {
      check_interval: '3s',
      limit_percentage: 70,
      spike_limit_percentage: 15,
    });
  });

  it('should configure Amazon Prometheus Service (APS) exporter', () => {
    const result = new OtelCollectorConfigBuilder()
      .withAPS(prometheusNamespace, prometheusEndpoint, awsRegion)
      .build();

    const expected = {
      receivers: {},
      processors: {},
      exporters: {
        prometheusremotewrite: {
          namespace: prometheusNamespace,
          endpoint: prometheusEndpoint,
          auth: { authenticator: 'sigv4auth' },
        },
      },
      extensions: {
        sigv4auth: {
          region: awsRegion,
          service: 'aps',
        },
      },
      service: {
        extensions: ['sigv4auth'],
        pipelines: {},
      },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should configure AWS X-Ray exporter', () => {
    const result = new OtelCollectorConfigBuilder()
      .withAWSXRayExporter(awsRegion)
      .build();

    const expected = {
      receivers: {},
      processors: {},
      exporters: {
        awsxray: { region: awsRegion },
      },
      extensions: {},
      service: { pipelines: {} },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should configure CloudWatch logs exporter', () => {
    const result = new OtelCollectorConfigBuilder()
      .withCloudWatchLogsExporter(
        awsRegion,
        logGroupName,
        logStreamName,
        logRetention,
      )
      .build();

    const expected = {
      receivers: {},
      processors: {},
      exporters: {
        awscloudwatchlogs: {
          region: awsRegion,
          log_group_name: logGroupName,
          log_stream_name: logStreamName,
          log_retention: logRetention,
        },
      },
      extensions: {},
      service: { pipelines: {} },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should configure health check extension', () => {
    const result = new OtelCollectorConfigBuilder()
      .withHealthCheckExtension()
      .build();

    const expected = {
      receivers: {},
      processors: {},
      exporters: {},
      extensions: {
        health_check: { endpoint: '0.0.0.0:13133' },
      },
      service: {
        extensions: ['health_check'],
        pipelines: {},
      },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should configure pprof extension', () => {
    const result = new OtelCollectorConfigBuilder()
      .withPprofExtension()
      .build();

    const expected = {
      receivers: {},
      processors: {},
      exporters: {},
      extensions: {
        pprof: { endpoint: '0.0.0.0:1777' },
      },
      service: {
        extensions: ['pprof'],
        pipelines: {},
      },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should configure pipelines', () => {
    const result = new OtelCollectorConfigBuilder()
      .withOTLPReceiver(['http'])
      .withBatchProcessor()
      .withMemoryLimiterProcessor()
      .withAWSXRayExporter(awsRegion)
      .withDebug()
      .withCloudWatchLogsExporter(
        awsRegion,
        logGroupName,
        logStreamName,
        logRetention,
      )
      .withMetricsPipeline(['otlp'], ['memory_limiter', 'batch'], ['debug'])
      .withTracesPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['awsxray', 'debug'],
      )
      .withLogsPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['awscloudwatchlogs'],
      )
      .build();

    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' },
          },
        },
      },
      processors: {
        batch: defaultBatchConfig,
        memory_limiter: defaultMemoryLimiterConfig,
      },
      exporters: {
        awsxray: { region: awsRegion },
        debug: { verbosity: 'detailed' },
        awscloudwatchlogs: {
          region: awsRegion,
          log_group_name: logGroupName,
          log_stream_name: logStreamName,
          log_retention: logRetention,
        },
      },
      extensions: {},
      service: {
        pipelines: {
          metrics: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['debug'],
          },
          traces: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['awsxray', 'debug'],
          },
          logs: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['awscloudwatchlogs'],
          },
        },
      },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('withDebug should use provided verbosity', () => {
    const verbosity = 'basic';

    const result = new OtelCollectorConfigBuilder()
      .withDebug(verbosity)
      .build();

    assert.strictEqual(result.exporters.debug?.verbosity, verbosity);
  });

  it('should generate default configuration', () => {
    const result = new OtelCollectorConfigBuilder()
      .withDefault({
        prometheusNamespace,
        prometheusEndpoint,
        region: awsRegion,
        logGroupName,
        logStreamName,
        logRetention,
      })
      .build();

    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' },
          },
        },
      },
      processors: {
        'batch/metrics': defaultBatchConfig,
        'batch/traces': {
          send_batch_max_size: 5000,
          send_batch_size: 2000,
          timeout: '2s',
        },
        'batch/logs': {
          send_batch_max_size: 5000,
          send_batch_size: 1024,
          timeout: '2s',
        },
        memory_limiter: defaultMemoryLimiterConfig,
      },
      exporters: {
        prometheusremotewrite: {
          namespace: prometheusNamespace,
          endpoint: prometheusEndpoint,
          auth: { authenticator: 'sigv4auth' },
        },
        awsxray: { region: awsRegion },
        awscloudwatchlogs: {
          region: awsRegion,
          log_group_name: logGroupName,
          log_stream_name: logStreamName,
          log_retention: logRetention,
        },
      },
      extensions: {
        sigv4auth: {
          region: awsRegion,
          service: 'aps',
        },
        health_check: { endpoint: '0.0.0.0:13133' },
      },
      service: {
        extensions: ['sigv4auth', 'health_check'],
        pipelines: {
          metrics: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch/metrics'],
            exporters: ['prometheusremotewrite'],
          },
          traces: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch/traces'],
            exporters: ['awsxray'],
          },
          logs: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch/logs'],
            exporters: ['awscloudwatchlogs'],
          },
        },
        telemetry: {
          logs: { level: 'error' },
          metrics: { level: 'basic' },
        },
      },
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should generate complete configuration', () => {
    const result = new OtelCollectorConfigBuilder()
      .withOTLPReceiver(['http'])
      .withBatchProcessor()
      .withMemoryLimiterProcessor()
      .withAPS(prometheusNamespace, prometheusEndpoint, awsRegion)
      .withAWSXRayExporter(awsRegion)
      .withCloudWatchLogsExporter(
        awsRegion,
        logGroupName,
        logStreamName,
        logRetention,
      )
      .withDebug()
      .withTelemetry()
      .withHealthCheckExtension()
      .withPprofExtension()
      .withMetricsPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['prometheusremotewrite', 'debug'],
      )
      .withTracesPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['awsxray', 'debug'],
      )
      .withLogsPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['awscloudwatchlogs', 'debug'],
      )
      .build();

    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' },
          },
        },
      },
      processors: {
        batch: defaultBatchConfig,
        memory_limiter: defaultMemoryLimiterConfig,
      },
      exporters: {
        prometheusremotewrite: {
          namespace: prometheusNamespace,
          endpoint: prometheusEndpoint,
          auth: { authenticator: 'sigv4auth' },
        },
        awsxray: { region: awsRegion },
        awscloudwatchlogs: {
          region: awsRegion,
          log_group_name: logGroupName,
          log_stream_name: logStreamName,
          log_retention: logRetention,
        },
        debug: { verbosity: 'detailed' },
      },
      extensions: {
        sigv4auth: {
          region: awsRegion,
          service: 'aps',
        },
        health_check: { endpoint: '0.0.0.0:13133' },
        pprof: { endpoint: '0.0.0.0:1777' },
      },
      service: {
        extensions: ['sigv4auth', 'health_check', 'pprof'],
        pipelines: {
          metrics: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['prometheusremotewrite', 'debug'],
          },
          traces: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['awsxray', 'debug'],
          },
          logs: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['awscloudwatchlogs', 'debug'],
          },
        },
        telemetry: {
          logs: { level: 'error' },
          metrics: { level: 'basic' },
        },
      },
    };

    assert.deepStrictEqual(result, expected);
  });
}
