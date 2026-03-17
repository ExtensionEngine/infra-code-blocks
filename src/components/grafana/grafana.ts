import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { commonTags } from '../../shared/common-tags';

const awsConfig = new pulumi.Config('aws');
const grafanaConfig = new pulumi.Config('grafana');

export namespace Grafana {
  export type PrometheusConfig = {
    prometheusEndpoint: pulumi.Input<string>;
    region?: string;
    prometheusPluginVersion?: string;
  };

  export type Args = {
    prometheus?: PrometheusConfig;
  };
}

export class Grafana extends pulumi.ComponentResource {
  grafanaIamRole: aws.iam.Role;
  prometheusDataSource?: grafana.oss.DataSource;

  constructor(
    name: string,
    args: Grafana.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:Grafana', name, {}, opts);

    this.grafanaIamRole = this.createGrafanaIamRole(name, args);

    if (args.prometheus) {
      this.createAmpRolePolicy(name, this.grafanaIamRole);
      this.createPrometheusDataSource(
        name,
        args.prometheus,
        this.grafanaIamRole,
      );
    }

    this.registerOutputs();
  }

  private createGrafanaIamRole(name: string, args: Grafana.Args) {
    const grafanaAwsAccountId =
      grafanaConfig.get('awsAccountId') ?? process.env.GRAFANA_AWS_ACCOUNT_ID;
    if (!grafanaAwsAccountId) {
      throw new Error(
        'Grafana AWS Account ID is not configured. Set it via Pulumi config (grafana:awsAccountId) or GRAFANA_AWS_ACCOUNT_ID env var.',
      );
    }

    const stackSlug = this.getStackSlug();
    const grafanaStack = grafana.cloud.getStack({ slug: stackSlug });

    const grafanaIamRole = new aws.iam.Role(
      `${name}-grafana-iam-role`,
      {
        assumeRolePolicy: pulumi.jsonStringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                AWS: `arn:aws:iam::${grafanaAwsAccountId}:root`,
              },
              Action: 'sts:AssumeRole',
              Condition: {
                StringEquals: {
                  'sts:ExternalId': pulumi.output(grafanaStack).id,
                },
              },
            },
          ],
        }),
        tags: commonTags,
      },
      { parent: this },
    );

    return grafanaIamRole;
  }

  private getStackSlug(): string {
    const grafanaUrl = grafanaConfig.get('url') ?? process.env.GRAFANA_URL;

    if (!grafanaUrl) {
      throw new Error(
        'Grafana URL is not configured. Set it via Pulumi config (grafana:url) or GRAFANA_URL env var.',
      );
    }

    return new URL(grafanaUrl).hostname.split('.')[0];
  }

  private createAmpRolePolicy(name: string, grafanaIamRole: aws.iam.Role) {
    new aws.iam.RolePolicy(
      `${name}-amp-policy`,
      {
        role: grafanaIamRole.id,
        policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'aps:GetSeries',
                'aps:GetLabels',
                'aps:GetMetricMetadata',
                'aps:QueryMetrics',
              ],
              Resource: '*',
            },
          ],
        }),
      },
      { parent: this },
    );
  }

  private createPrometheusDataSource(
    name: string,
    config: Grafana.PrometheusConfig,
    grafanaIamRole: aws.iam.Role,
  ) {
    const stackSlug = this.getStackSlug();
    const region = config.region ?? awsConfig.require('region');

    const plugin = new grafana.cloud.PluginInstallation(
      `${name}-prometheus-plugin`,
      {
        stackSlug,
        slug: 'grafana-amazonprometheus-datasource',
        version: config.prometheusPluginVersion ?? 'latest',
      },
      { parent: this },
    );

    this.prometheusDataSource = new grafana.oss.DataSource(
      `${name}-prometheus-datasource`,
      {
        type: 'grafana-amazonprometheus-datasource',
        url: config.prometheusEndpoint,
        jsonDataEncoded: pulumi.jsonStringify({
          sigV4Auth: true,
          sigV4AuthType: 'grafana_assume_role',
          sigV4Region: region,
          sigV4AssumeRoleArn: grafanaIamRole.arn,
        }),
      },
      { dependsOn: [plugin], parent: this },
    );
  }
}
