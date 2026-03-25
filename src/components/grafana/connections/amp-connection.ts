import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaConnection } from './connection';

const awsConfig = new pulumi.Config('aws');
const pluginName = 'grafana-amazonprometheus-datasource';

export namespace AMPConnection {
  export type Args = GrafanaConnection.Args & {
    endpoint: pulumi.Input<string>;
    region?: string;
    pluginVersion?: string;
  };
}

export class AMPConnection extends GrafanaConnection {
  public readonly name: string;
  public readonly dataSource: grafana.oss.DataSource;
  public readonly plugin: grafana.cloud.PluginInstallation;
  public readonly rolePolicy: aws.iam.RolePolicy;

  constructor(
    name: string,
    args: AMPConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:AMPConnection', name, args, opts);

    this.name = name;

    this.rolePolicy = this.createAmpRolePolicy();
    this.plugin = this.createPlugin(args.pluginVersion);
    this.dataSource = this.createDataSource(args.region, args.endpoint);

    this.registerOutputs();
  }

  private createAmpRolePolicy(): aws.iam.RolePolicy {
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
      `${this.name}-amp-policy`,
      {
        role: this.role.id,
        policy: policy.json,
      },
      { parent: this },
    );
  }

  private createPlugin(
    pluginVersion?: AMPConnection.Args['pluginVersion'],
  ): grafana.cloud.PluginInstallation {
    return new grafana.cloud.PluginInstallation(
      `${this.name}-amp-plugin`,
      {
        stackSlug: this.getStackSlug(),
        slug: pluginName,
        version: pluginVersion ?? 'latest',
      },
      { parent: this },
    );
  }

  private createDataSource(
    region: AMPConnection.Args['region'],
    endpoint: AMPConnection.Args['endpoint'],
  ): grafana.oss.DataSource {
    const ampRegion = region ?? awsConfig.require('region');
    const dataSourceName = `${this.name}-amp-datasource`;

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
          sigV4AssumeRoleArn: this.role.arn,
        }),
      },
      { dependsOn: [this.plugin], parent: this },
    );
  }
}
