import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as batchProcessor from './batch-processor';
import * as memoryLimiterProcessor from './memory-limiter-processor';
import { OtelCollector } from '.';
import { OtelCollectorConfigBuilder } from './config';
import { EcsService } from '../components/ecs-service';
import { OTLPReceiver } from './otlp-receiver';
import { PrometheusRemoteWriteExporter } from './prometheus-remote-write-exporter';

export namespace OtelCollectorBuilder {
  export type WithDefaultArgs = {
    prometheusNamespace: PrometheusRemoteWriteExporter.Config['namespace'];
    prometheusWorkspace: aws.amp.Workspace;
    region: string;
    logGroup: aws.cloudwatch.LogGroup;
    logStreamName: string;
  };
}

export class OtelCollectorBuilder {
  private readonly _serviceName: pulumi.Output<string>;
  private readonly _env: pulumi.Output<string>;
  private readonly _configBuilder: OtelCollectorConfigBuilder;
  private _taskRoleInlinePolicies: pulumi.Output<EcsService.RoleInlinePolicy>[] =
    [];

  constructor(serviceName: pulumi.Input<string>, env: pulumi.Input<string>) {
    this._serviceName = pulumi.output(serviceName);
    this._env = pulumi.output(env);
    this._configBuilder = new OtelCollectorConfigBuilder();
  }

  withOTLPReceiver(protocols: OTLPReceiver.Protocol[] = ['http']): this {
    this._configBuilder.withOTLPReceiver(protocols);

    return this;
  }

  withBatchProcessor(
    name = batchProcessor.defaults.name,
    size = batchProcessor.defaults.size,
    maxSize = batchProcessor.defaults.maxSize,
    timeout = batchProcessor.defaults.timeout,
  ): this {
    this._configBuilder.withBatchProcessor(name, size, maxSize, timeout);

    return this;
  }

  withMemoryLimiterProcessor(
    checkInterval = memoryLimiterProcessor.defaults.checkInterval,
    limitPercentage = memoryLimiterProcessor.defaults.limitPercentage,
    spikeLimitPercentage = memoryLimiterProcessor.defaults.spikeLimitPercentage,
  ): this {
    this._configBuilder.withMemoryLimiterProcessor(
      checkInterval,
      limitPercentage,
      spikeLimitPercentage,
    );

    return this;
  }

  withAWSXRayExporter(region: string): this {
    this._configBuilder.withAWSXRayExporter(region);
    this.createAWSXRayPolicy();

    return this;
  }

  withCloudWatchLogsExporter(
    region: string,
    logGroup: aws.cloudwatch.LogGroup,
    logStreamName: string,
  ): this {
    this._configBuilder.withCloudWatchLogsExporter(
      region,
      logGroup.name,
      logStreamName,
      logGroup.retentionInDays,
    );
    this.createCloudWatchLogsPolicy(logGroup);

    return this;
  }

  withHealthCheckExtension(endpoint = '0.0.0.0:13133'): this {
    this._configBuilder.withHealthCheckExtension(endpoint);

    return this;
  }

  withPprofExtension(endpoint = '0.0.0.0:1777'): this {
    this._configBuilder.withPprofExtension(endpoint);

    return this;
  }

  withAPS(
    namespace: pulumi.Input<string>,
    workspace: aws.amp.Workspace,
    region: string,
  ): this {
    this._configBuilder.withAPS(
      pulumi.output(namespace),
      pulumi.interpolate`${workspace.prometheusEndpoint}api/v1/remote_write`,
      region,
    );
    this.createAPSInlinePolicy(workspace);

    return this;
  }

  withDebug(verbosity: 'normal' | 'basic' | 'detailed' = 'detailed'): this {
    this._configBuilder.withDebug(verbosity);

    return this;
  }

  withTelemetry(
    logLevel: 'debug' | 'warn' | 'error' = 'error',
    metricsVerbosity: 'basic' | 'normal' | 'detailed' = 'basic',
  ): this {
    this._configBuilder.withTelemetry(logLevel, metricsVerbosity);

    return this;
  }

  withMetricsPipeline(
    receivers: OtelCollector.ReceiverType[],
    processors: OtelCollector.ProcessorType[],
    exporters: OtelCollector.ExporterType[],
  ): this {
    this._configBuilder.withMetricsPipeline(receivers, processors, exporters);

    return this;
  }

  withTracesPipeline(
    receivers: OtelCollector.ReceiverType[],
    processors: OtelCollector.ProcessorType[],
    exporters: OtelCollector.ExporterType[],
  ): this {
    this._configBuilder.withTracesPipeline(receivers, processors, exporters);

    return this;
  }

  withLogsPipeline(
    receivers: OtelCollector.ReceiverType[],
    processors: OtelCollector.ProcessorType[],
    exporters: OtelCollector.ExporterType[],
  ): this {
    this._configBuilder.withLogsPipeline(receivers, processors, exporters);

    return this;
  }

  withDefault({
    prometheusNamespace,
    prometheusWorkspace,
    region,
    logGroup,
    logStreamName,
  }: OtelCollectorBuilder.WithDefaultArgs): this {
    this._configBuilder.withDefault({
      prometheusNamespace,
      prometheusEndpoint: pulumi.interpolate`${prometheusWorkspace.prometheusEndpoint}api/v1/remote_write`,
      region,
      logGroupName: logGroup.name,
      logStreamName,
    });
    this.createAPSInlinePolicy(prometheusWorkspace);
    this.createAWSXRayPolicy();
    this.createCloudWatchLogsPolicy(logGroup);

    return this;
  }

  build(): OtelCollector {
    return new OtelCollector(
      this._serviceName,
      this._env,
      this._configBuilder.build(),
      { taskRoleInlinePolicies: this._taskRoleInlinePolicies },
    );
  }

  private createAPSInlinePolicy(workspace: aws.amp.Workspace): void {
    const policy: pulumi.Output<EcsService.RoleInlinePolicy> = pulumi
      .all([this._serviceName, workspace.arn])
      .apply(([serviceName, workspaceArn]) => ({
        name: `${serviceName}-task-role-aps-write`,
        policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['aps:RemoteWrite'],
              Resource: workspaceArn,
            },
          ],
        }),
      }));

    this._taskRoleInlinePolicies.push(policy);
  }

  private createAWSXRayPolicy() {
    const policy: pulumi.Output<EcsService.RoleInlinePolicy> =
      this._serviceName.apply(serviceName => ({
        name: `${serviceName}-task-role-xray`,
        policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'xray:PutTraceSegments',
                'xray:PutTelemetryRecords',
                'xray:GetSamplingRules',
                'xray:GetSamplingTargets',
                'xray:GetSamplingStatisticSummaries',
              ],
              Resource: '*',
            },
          ],
        }),
      }));

    this._taskRoleInlinePolicies.push(policy);
  }

  private createCloudWatchLogsPolicy(logGroup: aws.cloudwatch.LogGroup) {
    const policy: pulumi.Output<EcsService.RoleInlinePolicy> = pulumi
      .all([this._serviceName, logGroup.arn])
      .apply(([serviceName, logGroupArn]) => {
        return {
          name: `${serviceName}-task-role-cloudwatch-logs`,
          policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'logs:CreateLogStream',
                  'logs:DescribeLogStreams',
                  'logs:PutLogEvents',
                ],
                Resource: `${logGroupArn}:*`,
              },
            ],
          }),
        };
      });

    this._taskRoleInlinePolicies.push(policy);
  }
}
