import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaConnection } from './connection';

const awsConfig = new pulumi.Config('aws');

export namespace AMPConnection {
  export type Args = {
    endpoint: pulumi.Input<string>;
    region?: string;
    pluginVersion?: string;
  };
}

export class AMPConnection extends GrafanaConnection {
  readonly dataSource: grafana.oss.DataSource;

  constructor(
    name: string,
    args: AMPConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:AMPConnection', name, opts);

    this.createAmpRolePolicy(name);

    const plugin = this.createPlugin(name, args.pluginVersion);

    this.dataSource = this.createDataSource(name, args, plugin);

    this.registerOutputs();
  }

  private createAmpRolePolicy(name: string) {
    const policy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: 'Allow',
          actions: [
            'aps:GetSeries',
            'aps:GetLabels',
            'aps:GetMetricMetadata',
            'aps:QueryMetrics',
          ],
          resources: ['*'],
        },
      ],
    });

    new aws.iam.RolePolicy(
      `${name}-amp-policy`,
      {
        role: this.iamRole.id,
        policy: policy.json,
      },
      { parent: this },
    );
  }

  private createPlugin(
    name: string,
    pluginVersion?: string,
  ): grafana.cloud.PluginInstallation {
    return new grafana.cloud.PluginInstallation(
      `${name}-prometheus-plugin`,
      {
        stackSlug: this.getStackSlug(),
        slug: 'grafana-amazonprometheus-datasource',
        version: pluginVersion ?? 'latest',
      },
      { parent: this },
    );
  }

  private createDataSource(
    name: string,
    args: AMPConnection.Args,
    plugin: grafana.cloud.PluginInstallation,
  ): grafana.oss.DataSource {
    const region = args.region ?? awsConfig.require('region');
    const dataSourceName = `${name}-prometheus-datasource`;

    return new grafana.oss.DataSource(
      dataSourceName,
      {
        name: dataSourceName,
        type: 'grafana-amazonprometheus-datasource',
        url: args.endpoint,
        jsonDataEncoded: pulumi.jsonStringify({
          sigV4Auth: true,
          sigV4AuthType: 'grafana_assume_role',
          sigV4Region: region,
          sigV4AssumeRoleArn: this.iamRole.arn,
        }),
      },
      { dependsOn: [plugin], parent: this },
    );
  }
}
