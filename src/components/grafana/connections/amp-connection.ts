import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { mergeWithDefaults } from '../../../shared/merge-with-defaults';
import { GrafanaConnection } from './connection';

const awsConfig = new pulumi.Config('aws');
const pluginName = 'grafana-amazonprometheus-datasource';

export namespace AMPConnection {
  export type Args = GrafanaConnection.Args & {
    endpoint: pulumi.Input<string>;
    region?: string;
    pluginVersion?: string;
    installPlugin?: boolean;
  };
}

const defaults = {
  region: awsConfig.require('region'),
  pluginVersion: 'latest',
  installPlugin: true,
};

export class AMPConnection extends GrafanaConnection {
  public readonly name: string;
  public readonly dataSource: grafana.oss.DataSource;
  public readonly rolePolicy: aws.iam.RolePolicy;
  public readonly plugin?: grafana.cloud.PluginInstallation;

  constructor(
    name: string,
    args: AMPConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:AMPConnection', name, args, opts);

    const argsWithDefaults = mergeWithDefaults(defaults, args);

    this.name = name;

    this.rolePolicy = this.createRolePolicy();

    if (argsWithDefaults.installPlugin) {
      this.plugin = this.createPlugin(argsWithDefaults.pluginVersion);
    }

    this.dataSource = this.createDataSource(
      argsWithDefaults.region,
      argsWithDefaults.endpoint,
    );

    this.registerOutputs();
  }

  private createRolePolicy(): aws.iam.RolePolicy {
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
    pluginVersion: string,
  ): grafana.cloud.PluginInstallation {
    return new grafana.cloud.PluginInstallation(
      `${this.name}-amp-plugin`,
      {
        stackSlug: this.stack.slug,
        slug: pluginName,
        version: pluginVersion,
      },
      { parent: this },
    );
  }

  private createDataSource(
    region: string,
    endpoint: AMPConnection.Args['endpoint'],
  ): grafana.oss.DataSource {
    return new grafana.oss.DataSource(
      `${this.name}-amp-datasource`,
      {
        name: this.dataSourceName,
        type: pluginName,
        url: endpoint,
        jsonDataEncoded: pulumi.jsonStringify({
          sigV4Auth: true,
          sigV4AuthType: 'grafana_assume_role',
          sigV4Region: region,
          sigV4AssumeRoleArn: this.role.arn,
        }),
      },
      { dependsOn: this.plugin ? [this.plugin] : [], parent: this },
    );
  }
}
