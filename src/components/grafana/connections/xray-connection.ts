import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { mergeWithDefaults } from '../../../shared/merge-with-defaults';
import { GrafanaConnection } from './connection';

const awsConfig = new pulumi.Config('aws');
const pluginName = 'grafana-x-ray-datasource';

export namespace XRayConnection {
  export type Args = GrafanaConnection.Args & {
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

export class XRayConnection extends GrafanaConnection {
  public readonly name: string;
  public readonly dataSource: grafana.oss.DataSource;
  public readonly rolePolicy: aws.iam.RolePolicy;
  public readonly plugin?: grafana.cloud.PluginInstallation;

  constructor(
    name: string,
    args: XRayConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:XRayConnection', name, args, opts);

    const argsWithDefaults = mergeWithDefaults(defaults, args);

    this.name = name;

    this.rolePolicy = this.createRolePolicy();

    if (argsWithDefaults.installPlugin) {
      this.plugin = this.createPlugin(argsWithDefaults.pluginVersion);
    }

    this.dataSource = this.createDataSource(argsWithDefaults.region);

    this.registerOutputs();
  }

  private createRolePolicy(): aws.iam.RolePolicy {
    const policy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: 'Allow',
          actions: [
            'xray:BatchGetTraces',
            'xray:GetTraceSummaries',
            'xray:GetTraceGraph',
            'xray:GetGroups',
            'xray:GetTimeSeriesServiceStatistics',
            'xray:GetInsightSummaries',
            'xray:GetInsight',
            'xray:GetServiceGraph',
            'ec2:DescribeRegions',
          ],
          resources: ['*'],
        },
      ],
    });

    return new aws.iam.RolePolicy(
      `${this.name}-x-ray-policy`,
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
      `${this.name}-x-ray-plugin`,
      {
        stackSlug: this.getStackSlug(),
        slug: pluginName,
        version: pluginVersion,
      },
      { parent: this },
    );
  }

  private createDataSource(region: string): grafana.oss.DataSource {
    const dataSourceName = `${this.name}-x-ray-datasource`;

    return new grafana.oss.DataSource(
      dataSourceName,
      {
        name: dataSourceName,
        type: pluginName,
        jsonDataEncoded: pulumi.jsonStringify({
          authType: 'grafana_assume_role',
          assumeRoleArn: this.role.arn,
          defaultRegion: region,
        }),
      },
      { dependsOn: this.plugin ? [this.plugin] : [], parent: this },
    );
  }
}
