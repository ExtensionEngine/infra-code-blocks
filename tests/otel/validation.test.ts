import { it } from 'node:test';
import * as assert from 'node:assert';
import { OtelCollectorConfigBuilder } from '../../src/otel/config';

export function testOtelCollectorConfigBuilderValidation() {
  it('should throw error when no OTLP receiver protocols are provided', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder().withOTLPReceiver([]).build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: 'At least one OTLP receiver protocol should be provided',
    });
  });

  it('should throw error when unsupported OTLP receiver protocol is provided', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        // @ts-expect-error - Passing invalid protocol to test runtime error
        .withOTLPReceiver(['invalid'])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: 'OTLP receiver protocol invalid is not supported',
    });
  });

  it('should throw error when metrics pipeline references undefined receiver', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withMetricsPipeline(['otlp'], [], [])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: "Receiver 'otlp' is used in metrics pipeline but not defined",
    });
  });

  it('should throw error when metrics pipeline references undefined processor', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withMetricsPipeline(['otlp'], ['batch'], [])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: "Processor 'batch' is used in metrics pipeline but not defined",
    });
  });

  it('should throw error when metrics pipeline references undefined exporter', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withBatchProcessor()
        .withMetricsPipeline(['otlp'], ['batch'], ['debug'])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: "Exporter 'debug' is used in metrics pipeline but not defined",
    });
  });

  it('should throw error when traces pipeline references undefined receiver', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withTracesPipeline(['otlp'], [], [])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: "Receiver 'otlp' is used in traces pipeline but not defined",
    });
  });

  it('should throw error when traces pipeline references undefined processor', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withTracesPipeline(['otlp'], ['memory_limiter'], [])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message:
        "Processor 'memory_limiter' is used in traces pipeline but not defined",
    });
  });

  it('should throw error when traces pipeline references undefined exporter', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withMemoryLimiterProcessor()
        .withTracesPipeline(['otlp'], ['memory_limiter'], ['awsxray'])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: "Exporter 'awsxray' is used in traces pipeline but not defined",
    });
  });

  it('should throw error when memory_limiter is not the first processor in traces pipeline ', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withMemoryLimiterProcessor()
        .withBatchProcessor()
        .withDebug()
        .withTracesPipeline(['otlp'], ['batch', 'memory_limiter'], ['debug'])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message:
        'memory_limiter processor is not the first processor in the traces pipeline.',
    });
  });

  it('should throw error when memory_limiter is not the first processor in metrics pipeline ', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withMemoryLimiterProcessor()
        .withBatchProcessor()
        .withDebug()
        .withMetricsPipeline(['otlp'], ['batch', 'memory_limiter'], ['debug'])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message:
        'memory_limiter processor is not the first processor in the metrics pipeline.',
    });
  });

  it('should throw error when logs pipeline references undefined receiver', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withLogsPipeline(['otlp'], [], [])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: "Receiver 'otlp' is used in logs pipeline but not defined",
    });
  });

  it('should throw error when logs pipeline references undefined processor', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withLogsPipeline(['otlp'], ['batch'], [])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message: "Processor 'batch' is used in logs pipeline but not defined",
    });
  });

  it('should throw error when logs pipeline references undefined exporter', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withBatchProcessor()
        .withLogsPipeline(['otlp'], ['batch'], ['awscloudwatchlogs'])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message:
        "Exporter 'awscloudwatchlogs' is used in logs pipeline but not defined",
    });
  });

  it('should throw error when memory_limiter is not the first processor in logs pipeline', () => {
    const createInvalidConfig = () =>
      new OtelCollectorConfigBuilder()
        .withOTLPReceiver(['http'])
        .withMemoryLimiterProcessor()
        .withBatchProcessor()
        .withDebug()
        .withLogsPipeline(['otlp'], ['batch', 'memory_limiter'], ['debug'])
        .build();

    assert.throws(createInvalidConfig, {
      name: 'Error',
      message:
        'memory_limiter processor is not the first processor in the logs pipeline.',
    });
  });
}
