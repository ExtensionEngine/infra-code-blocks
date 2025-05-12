import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { describe, expect, it } from 'tstyche';
import { next as studion } from '@studion/infra-code-blocks';
import { OtelCollector } from '../../dist/v2/otel';
import { OtelCollectorBuilder } from '../../dist/v2/otel/builder';

describe('Build output', () => {
  describe('ECS Service', () => {
    it('should export EcsService', () => {
      expect(studion).type.toHaveProperty('EcsService');
    });

    describe('Instantiation', () => {
      const { EcsService } = studion;

      it('should construct EcsService', () => {
        expect(EcsService).type.toBeConstructableWith('ecsName', {
          vpc: new awsx.ec2.Vpc('vpcName'),
          cluster: new aws.ecs.Cluster('clusterName'),
          containers: [
            {
              name: 'mainContainer',
              image: 'sample/image',
            },
          ],
        });
      });
    });
  });

  describe('Web Server', () => {
    it('should export WebServer', () => {
      expect(studion).type.toHaveProperty('WebServer');
    });

    it('should export WebServerBuilder', () => {
      expect(studion).type.toHaveProperty('WebServerBuilder');
    });

    it('should export WebServerLoadBalancer', () => {
      expect(studion).type.toHaveProperty('WebServerLoadBalancer');
    });

    describe('Instantiation', () => {
      const { WebServer, WebServerBuilder, WebServerLoadBalancer } = studion;

      it('should construct WebServer', () => {
        expect(WebServer).type.toBeConstructableWith('wsName', {
          vpc: new awsx.ec2.Vpc('vpcName'),
          cluster: new aws.ecs.Cluster('clusterName'),
          image: 'sample/image',
          port: 8080,
          publicSubnetIds: ['sub-1', 'sub-2', 'sub-3'],
        });
      });

      it('should construct WebServerBuilder', () => {
        expect(WebServerBuilder).type.toBeConstructableWith('wsbName');
      });

      it('should construct WebServerLoadBalancer', () => {
        expect(WebServerLoadBalancer).type.toBeConstructableWith('wslbName', {
          vpc: new awsx.ec2.Vpc('vpcName'),
          port: 80,
        });
      });
    });

    describe('Builder', () => {
      const builder = new studion.WebServerBuilder('wsbName');

      it('should have build method', () => {
        expect(builder.build).type.toBeCallableWith();
      });

      it('should have configureEcs method', () => {
        expect(builder.configureEcs).type.toBeCallableWith({
          cluster: new aws.ecs.Cluster('clusterName'),
        });
      });

      it('should have configureWebServer method', () => {
        expect(builder.configureWebServer).type.toBeCallableWith(
          'sample/image',
          8080,
        );
      });

      it('should have withCustomDomain method', () => {
        expect(builder.withCustomDomain).type.toBeCallableWith(
          'domainName',
          'hzId',
        );
      });

      it('should have withCustomHealthCheckPath method', () => {
        expect(builder.withCustomHealthCheckPath).type.toBeCallableWith(
          '/custom/healthCheck/path',
        );
      });

      it('should have withInitContainer method', () => {
        expect(builder.withInitContainer).type.toBeCallableWith({
          name: 'containerName',
          image: 'sample/image',
        });
      });

      it('should have withOtelCollector method', () => {
        expect(builder.withOtelCollector).type.toBeCallableWith(
          new OtelCollector('serviceName', 'testEnv', {
            receivers: {},
            processors: {},
            exporters: {},
            extensions: {},
            service: {
              pipelines: {},
            },
          }),
        );
      });

      it('should have withSidecarContainer method', () => {
        expect(builder.withSidecarContainer).type.toBeCallableWith({
          name: 'containerName',
          image: 'sample/image',
          healthCheck: {},
        });
      });

      it('should have withVolume method', () => {
        expect(builder.withVolume).type.toBeCallableWith({
          name: 'volumeName',
        });
      });

      it('should have withVpc method', () => {
        expect(builder.withVpc).type.toBeCallableWith(
          new awsx.ec2.Vpc('vpcName'),
        );
      });
    });
  });

  describe('Open Telemetry', () => {
    it('should export openTelemetry', () => {
      expect(studion).type.toHaveProperty('openTelemetry');
    });

    it('should contain OtelCollector', () => {
      expect(studion.openTelemetry).type.toHaveProperty('OtelCollector');
    });

    it('should contain OtelCollectorBuilder', () => {
      expect(studion.openTelemetry).type.toHaveProperty('OtelCollectorBuilder');
    });

    describe('Instantiation', () => {
      const {
        openTelemetry: { OtelCollector, OtelCollectorBuilder },
      } = studion;

      it('should construct OtelCollector', () => {
        expect(OtelCollector).type.toBeConstructableWith(
          'serviceName',
          'testEnv',
          {
            receivers: {},
            processors: {},
            exporters: {},
            extensions: {},
            service: {
              pipelines: {},
            },
          },
        );
      });

      it('should construct OtelCollectorBuilder', () => {
        expect(OtelCollectorBuilder).type.toBeConstructableWith(
          'serviceName',
          'testEnv',
        );
      });
    });

    describe('Builder', () => {
      const builder = new OtelCollectorBuilder('serviceName', 'testEnv');

      it('should have build method', () => {
        expect(builder.build).type.toBeCallableWith();
      });

      it('should have withAPS method', () => {
        expect(builder.withAPS).type.toBeCallableWith(
          'namespace',
          new aws.amp.Workspace('name'),
          'region',
        );
      });

      it('should have withAWSXRayExporter method', () => {
        expect(builder.withAWSXRayExporter).type.toBeCallableWith('region');
      });

      it('should have withBatchProcessor method', () => {
        expect(builder.withBatchProcessor).type.toBeCallableWith(3, 9, '7s');
      });

      it('should have withDebug method', () => {
        expect(builder.withDebug).type.toBeCallableWith();
      });

      it('should have withDefault method', () => {
        expect(builder.withDefault).type.toBeCallableWith(
          'namespace',
          new aws.amp.Workspace('name'),
          'region',
        );
      });

      it('should have withHealthCheckExtension method', () => {
        expect(builder.withHealthCheckExtension).type.toBeCallableWith();
      });

      it('should have withMemoryLimiterProcessor method', () => {
        expect(builder.withMemoryLimiterProcessor).type.toBeCallableWith(
          '3s',
          77,
          7,
        );
      });

      it('should have withMetricsPipeline method', () => {
        expect(builder.withMetricsPipeline).type.toBeCallableWith([], [], []);
      });

      it('should have withOTLPReceiver method', () => {
        expect(builder.withOTLPReceiver).type.toBeCallableWith();
      });

      it('should have withPprofExtension method', () => {
        expect(builder.withPprofExtension).type.toBeCallableWith();
      });

      it('should have withTelemetry method', () => {
        expect(builder.withTelemetry).type.toBeCallableWith();
      });

      it('should have withTracesPipeline method', () => {
        expect(builder.withTracesPipeline).type.toBeCallableWith([], [], []);
      });
    });
  });
});
