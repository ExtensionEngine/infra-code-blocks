import * as pulumi from '@pulumi/pulumi';
import { EcsService } from '../components/ecs-service';

export namespace OtelCollector {
  export type Args = {
    containerName: pulumi.Input<string>;
    serviceName: pulumi.Input<string>;
    env: pulumi.Input<string>;
    config: pulumi.Input<string>;
    configVolumeName: pulumi.Input<string>;
  };
}

export class OtelCollector {
  container: EcsService.Container;
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
      configVolumeName,
      serviceName,
      env
    );
  }

  get containers(): EcsService.Container[] {
    return [this.configContainer, this.container];
  }

  private createContainer(
    containerName: pulumi.Input<string>,
    configVolumeName: pulumi.Input<string>,
    serviceName: pulumi.Input<string>,
    env: pulumi.Input<string>
  ): EcsService.Container {
    return {
      name: containerName,
      image: 'otel/opentelemetry-collector-contrib:latest',
      portMappings: [
        { containerPort: 4317, hostPort: 4317, protocol: 'tcp' },
        { containerPort: 4318, hostPort: 4318, protocol: 'tcp' },
        // TODO: Expose 8888 for collector telemetry
        { containerPort: 13133, hostPort: 13133, protocol: 'tcp' },
      ],
      mountPoints: [{
        sourceVolume: configVolumeName,
        containerPath: '/etc/otelcol-contrib',
        readOnly: true
      }],
      dependsOn: [{
        containerName: this.configContainer.name,
        condition: 'COMPLETE'
      }],
      environment: [
        { name: 'OTEL_RESOURCE_ATTRIBUTES', value: `service.name=${serviceName},env=${env}` },
        { name: 'OTEL_LOG_LEVEL', value: 'debug' },
        { name: 'OTELCOL_CONTRIB_DEBUG', value: '1' }
      ]
    };
  }

  private createConfigContainer(
    config: pulumi.Input<string>,
    volume: pulumi.Input<string>
  ): EcsService.Container {
    return {
      name: 'otel-config-writer',
      image: 'amazonlinux:latest',
      essential: false,
      command: [
        'sh', '-c',
        pulumi.interpolate`echo '${config}' > /etc/otelcol-contrib/config.yaml`],
      mountPoints: [{
        sourceVolume: volume,
        containerPath: '/etc/otelcol-contrib',
      }]
    }
  }
}
