import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { OtelCollectorConfigBuilder } from '../../src/v2/otel/config';
import { testOtelCollectorConfigBuilderValidation } from './validation.test';

const awsRegion = 'us-west-2';
const prometheusNamespace = 'test-namespace';
const prometheusWriteEndpoint = 'https://aps-workspaces.us-west-2.amazonaws.com/workspaces/ws-12345/api/v1/remote_write';

const defaultMemoryLimiterConfig = {
  check_interval: '1s',
  limit_percentage: 80,
  spike_limit_percentage: 15
};
const defaultBatchConfig = {
  send_batch_size: 8192,
  send_batch_max_size: 10000,
  timeout: '5s'
};

describe('OtelCollectorConfigBuilder', () => {
  it(
    'should generate minimal configuration with OTLP receiver and debug exporter',
    () => {
      const result = new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withDebug()
        .build();

      const expected = {
        receivers: {
          otlp: {
            protocols: {
              http: { endpoint: '0.0.0.0:4318' }
            }
          }
        },
        processors: {},
        exporters: {
          debug: { verbosity: 'detailed' }
        },
        extensions: {},
        service: { pipelines: {} }
      };

      assert.deepStrictEqual(result, expected);
    }
  );

  it('should configure batch processor', () => {
    const result = new OtelCollectorConfigBuilder()
      .withBatchProcessor()
      .build();


    const expected = {
      receivers: {},
      processors: {
        batch: defaultBatchConfig
      },
      exporters: {},
      extensions: {},
      service: { pipelines: {} }
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
        memory_limiter: defaultMemoryLimiterConfig
      },
      exporters: {},
      extensions: {},
      service: { pipelines: {} }
    };

    assert.deepStrictEqual(result, expected);
  });

  it('withBatchProcessor should use provided parameters', () => {
    const result = new OtelCollectorConfigBuilder()
      .withBatchProcessor(5000, 8000, '10s')
      .build();

    assert.deepStrictEqual(result.processors.batch, {
      send_batch_size: 5000,
      send_batch_max_size: 8000,
      timeout: '10s'
    });
  });

  it('withMemoryLimiterProcessor should use provided parameters', () => {
    const result = new OtelCollectorConfigBuilder()
      .withMemoryLimiterProcessor('3s', 70, 15)
      .build();

    assert.deepStrictEqual(result.processors.memory_limiter, {
      check_interval: '3s',
      limit_percentage: 70,
      spike_limit_percentage: 15
    });
  });

  it('should configure Amazon Prometheus Service (APS) exporter', () => {
    const result = new OtelCollectorConfigBuilder()
      .withAPS(prometheusNamespace, prometheusWriteEndpoint, awsRegion)
      .build();

    const expected = {
      receivers: {},
      processors: {},
      exporters: {
        prometheusremotewrite: {
          namespace: prometheusNamespace,
          endpoint: prometheusWriteEndpoint,
          auth: { authenticator: 'sigv4auth' }
        }
      },
      extensions: {
        sigv4auth: {
          region: awsRegion,
          service: 'aps'
        }
      },
      service: {
        extensions: ['sigv4auth'],
        pipelines: {}
      }
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
        awsxray: { region: awsRegion }
      },
      extensions: {},
      service: { pipelines: {} }
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
        health_check: { endpoint: '0.0.0.0:13133' }
      },
      service: {
        extensions: ['health_check'],
        pipelines: {}
      }
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
        pprof: { endpoint: '0.0.0.0:1777' }
      },
      service: {
        extensions: ['pprof'],
        pipelines: {}
      }
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
      .withMetricsPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['debug']
      )
      .withTracesPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['awsxray', 'debug']
      )
      .build();

    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' }
          }
        }
      },
      processors: {
        batch: defaultBatchConfig,
        memory_limiter: defaultMemoryLimiterConfig
      },
      exporters: {
        awsxray: { region: awsRegion },
        debug: { verbosity: 'detailed' }
      },
      extensions: {},
      service: {
        pipelines: {
          metrics: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['debug']
          },
          traces: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['awsxray', 'debug']
          }
        }
      }
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
      .withDefault(prometheusNamespace, prometheusWriteEndpoint, awsRegion)
      .build();


    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' }
          }
        }
      },
      processors: {
        batch: defaultBatchConfig,
        memory_limiter: defaultMemoryLimiterConfig
      },
      exporters: {
        prometheusremotewrite: {
          namespace: prometheusNamespace,
          endpoint: prometheusWriteEndpoint,
          auth: { authenticator: 'sigv4auth' }
        },
        awsxray: { region: awsRegion }
      },
      extensions: {
        sigv4auth: {
          region: awsRegion,
          service: 'aps'
        },
        health_check: { endpoint: '0.0.0.0:13133' }
      },
      service: {
        extensions: ['sigv4auth', 'health_check'],
        pipelines: {
          metrics: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['prometheusremotewrite']
          },
          traces: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['awsxray']
          }
        },
        telemetry: {
          logs: { level: 'error' },
          metrics: { level: 'basic' }
        }
      }
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should generate complete configuration', () => {
    const result = new OtelCollectorConfigBuilder()
      .withOTLPReceiver(['http'])
      .withBatchProcessor()
      .withMemoryLimiterProcessor()
      .withAPS(prometheusNamespace, prometheusWriteEndpoint, awsRegion)
      .withAWSXRayExporter(awsRegion)
      .withDebug()
      .withTelemetry()
      .withHealthCheckExtension()
      .withPprofExtension()
      .withMetricsPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['prometheusremotewrite', 'debug']
      )
      .withTracesPipeline(
        ['otlp'],
        ['memory_limiter', 'batch'],
        ['awsxray', 'debug']
      )
      .build();


    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' }
          }
        }
      },
      processors: {
        batch: defaultBatchConfig,
        memory_limiter: defaultMemoryLimiterConfig
      },
      exporters: {
        prometheusremotewrite: {
          namespace: prometheusNamespace,
          endpoint: prometheusWriteEndpoint,
          auth: { authenticator: 'sigv4auth' }
        },
        awsxray: { region: awsRegion },
        debug: { verbosity: 'detailed' }
      },
      extensions: {
        sigv4auth: {
          region: awsRegion,
          service: 'aps'
        },
        health_check: { endpoint: '0.0.0.0:13133' },
        pprof: { endpoint: '0.0.0.0:1777' }
      },
      service: {
        extensions: ['sigv4auth', 'health_check', 'pprof'],
        pipelines: {
          metrics: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['prometheusremotewrite', 'debug']
          },
          traces: {
            receivers: ['otlp'],
            processors: ['memory_limiter', 'batch'],
            exporters: ['awsxray', 'debug']
          }
        },
        telemetry: {
          logs: { level: 'error' },
          metrics: { level: 'basic' }
        }
      }
    };

    assert.deepStrictEqual(result, expected);
  });

  describe('validation', testOtelCollectorConfigBuilderValidation);
});
