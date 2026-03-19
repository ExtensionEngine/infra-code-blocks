import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaConnection } from './connection';

const awsConfig = new pulumi.Config('aws');
const pluginName = 'grafana-amazonprometheus-datasource';

export namespace AMPConnection {
  export type Args = {
    endpoint: pulumi.Input<string>;
    region?: string;
    pluginVersion?: string;
  };
}

export class AMPConnection extends GrafanaConnection {
  name: string;
  dataSource: grafana.oss.DataSource;
  plugin: grafana.cloud.PluginInstallation;
  rolePolicy: aws.iam.RolePolicy;

  constructor(
    name: string,
    args: AMPConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:AMPConnection', name, opts);

    this.name = name;

    this.rolePolicy = this.createAmpRolePolicy(name);
    this.plugin = this.createPlugin(name, args.pluginVersion);
    this.dataSource = this.createDataSource(
      name,
      args.region,
      args.endpoint,
      this.plugin,
    );

    this.registerOutputs();
  }

  private createAmpRolePolicy(name: string): aws.iam.RolePolicy {
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

    return new aws.iam.RolePolicy(
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
    pluginVersion?: AMPConnection.Args['pluginVersion'],
  ): grafana.cloud.PluginInstallation {
    return new grafana.cloud.PluginInstallation(
      `${name}-amp-plugin`,
      {
        stackSlug: this.getStackSlug(),
        slug: pluginName,
        version: pluginVersion ?? 'latest',
      },
      { parent: this },
    );
  }

  private createDataSource(
    name: string,
    region: AMPConnection.Args['region'],
    endpoint: AMPConnection.Args['endpoint'],
    plugin: grafana.cloud.PluginInstallation,
  ): grafana.oss.DataSource {
    const ampRegion = region ?? awsConfig.require('region');
    const dataSourceName = `${name}-amp-datasource`;

    return new grafana.oss.DataSource(
      dataSourceName,
      {
        name: dataSourceName,
        type: pluginName,
        url: endpoint,
        jsonDataEncoded: pulumi.jsonStringify({
          sigV4Auth: true,
          sigV4AuthType: 'grafana_assume_role',
          sigV4Region: ampRegion,
          sigV4AssumeRoleArn: this.iamRole.arn,
        }),
      },
      { dependsOn: [plugin], parent: this },
    );
  }
}
