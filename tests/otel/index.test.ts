import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as yaml from 'yaml';
import { OtelCollectorConfigBuilder } from '../../src/v2/otel/config';
import { testOtelCollectorConfigBuilderValidation } from './validation.test';

const awsRegion = 'us-west-2';
const prometheusNamespace = 'test-namespace';
const prometheusWriteEndpoint = 'https://aps-workspaces.us-west-2.amazonaws.com/workspaces/ws-12345/api/v1/remote_write';

describe('OtelCollectorConfigBuilder', () => {
  it(
    'should generate minimal configuration with OTLP receiver and debug exporter',
    () => {
      const yamlOutput = new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withDebug()
        .build();

      const result = yaml.parse(yamlOutput);

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
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withBatchProcessor()
      .build();

    const result = yaml.parse(yamlOutput);

    const expected = {
      receivers: {},
      processors: {
        batch: {
          send_batch_size: 8192,
          send_batch_max_size: 10000,
          timeout: '5s'
        }
      },
      exporters: {},
      extensions: {},
      service: { pipelines: {} }
    };

    assert.deepStrictEqual(result, expected);
  });

  it('should configure memory limiter processor', () => {
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withMemoryLimiterProcessor()
      .build();

    const result = yaml.parse(yamlOutput);

    const expected = {
      receivers: {},
      processors: {
        memory_limiter: {
          check_interval: '5s',
          limit_percentage: 80,
          spike_limit_percentage: 25
        }
      },
      exporters: {},
      extensions: {},
      service: { pipelines: {} }
    };

    assert.deepStrictEqual(result, expected);
  });

  it('withBatchProcessor should use provided parameters', () => {
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withBatchProcessor(5000, 8000, '10s')
      .build();

    const result = yaml.parse(yamlOutput);
    assert.deepStrictEqual(result.processors.batch, {
      send_batch_size: 5000,
      send_batch_max_size: 8000,
      timeout: '10s'
    });
  });

  it('withMemoryLimiterProcessor should use provided parameters', () => {
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withMemoryLimiterProcessor('3s', 70, 15)
      .build();

    const result = yaml.parse(yamlOutput);
    assert.deepStrictEqual(result.processors.memory_limiter, {
      check_interval: '3s',
      limit_percentage: 70,
      spike_limit_percentage: 15
    });
  });

  it('should configure Amazon Prometheus Service (APS) exporter', () => {
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withAPS(prometheusNamespace, prometheusWriteEndpoint, awsRegion)
      .build();

    const result = yaml.parse(yamlOutput);
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
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withAWSXRayExporter(awsRegion)
      .build();

    const result = yaml.parse(yamlOutput);
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

  it('should configure SigV4Auth extension', () => {
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withSigV4AuthExtension(awsRegion)
      .build();

    const result = yaml.parse(yamlOutput);
    const expected = {
      receivers: {},
      processors: {},
      exporters: {},
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

  it('should configure health check extension', () => {
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withHealthCheckExtension()
      .build();

    const result = yaml.parse(yamlOutput);
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
    const yamlOutput = new OtelCollectorConfigBuilder()
      .withPprofExtension()
      .build();

    const result = yaml.parse(yamlOutput);
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
    const yamlOutput = new OtelCollectorConfigBuilder()
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

    const result = yaml.parse(yamlOutput);
    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' }
          }
        }
      },
      processors: {
        batch: {
          send_batch_size: 8192,
          send_batch_max_size: 10000,
          timeout: '5s'
        },
        memory_limiter: {
          check_interval: '5s',
          limit_percentage: 80,
          spike_limit_percentage: 25
        }
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

    const yamlOutput = new OtelCollectorConfigBuilder()
      .withDebug(verbosity)
      .build();

    const result = yaml.parse(yamlOutput);
    assert.strictEqual(result.exporters.debug.verbosity, verbosity);
  });

  it('should generate complete configuration', () => {
    const yamlOutput = new OtelCollectorConfigBuilder()
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

    const result = yaml.parse(yamlOutput);

    const expected = {
      receivers: {
        otlp: {
          protocols: {
            http: { endpoint: '0.0.0.0:4318' }
          }
        }
      },
      processors: {
        batch: {
          send_batch_size: 8192,
          send_batch_max_size: 10000,
          timeout: '5s'
        },
        memory_limiter: {
          check_interval: '5s',
          limit_percentage: 80,
          spike_limit_percentage: 25
        }
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
