import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';

// Fixed AWS account ID owned by Grafana Cloud, used to assume roles in customer accounts.
const GRAFANA_CLOUD_AWS_ACCOUNT_ID = '008923505280';

export namespace Grafana {
  export type PrometheusConfig = {
    prometheusEndpoint: pulumi.Input<string>;
    region: pulumi.Input<string>;
  };

  export type Args = {
    prometheus?: PrometheusConfig;
    tags?: pulumi.Input<{
      [key: string]: pulumi.Input<string>;
    }>;
  };
}

export class Grafana extends pulumi.ComponentResource {
  prometheusDataSource?: grafana.oss.DataSource;

  constructor(
    name: string,
    args: Grafana.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:Grafana', name, {}, opts);

    if (args.prometheus) {
      const ampRole = this.createAmpRole(name, args.tags);
      this.createPrometheusDataSource(name, args.prometheus, ampRole);
    }

    this.registerOutputs();
  }

  private getStackSlug(): string {
    const grafanaUrl = process.env.GRAFANA_URL;

    if (!grafanaUrl) {
      throw new Error('GRAFANA_URL environment variable is not set.');
    }

    return new URL(grafanaUrl).hostname.split('.')[0];
  }

  private createAmpRole(name: string, tags: Grafana.Args['tags']) {
    const stackSlug = this.getStackSlug();
    const grafanaStack = grafana.cloud.getStack({ slug: stackSlug });

    const ampRole = new aws.iam.Role(
      `${name}-amp-role`,
      {
        assumeRolePolicy: pulumi.jsonStringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                AWS: `arn:aws:iam::${GRAFANA_CLOUD_AWS_ACCOUNT_ID}:root`,
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
        tags,
      },
      { parent: this },
    );

    new aws.iam.RolePolicy(
      `${name}-amp-policy`,
      {
        role: ampRole.id,
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

    return ampRole;
  }

  private createPrometheusDataSource(
    name: string,
    config: Grafana.PrometheusConfig,
    ampRole: aws.iam.Role,
  ) {
    const stackSlug = this.getStackSlug();

    const plugin = new grafana.cloud.PluginInstallation(
      `${name}-prometheus-plugin`,
      {
        stackSlug,
        slug: 'grafana-amazonprometheus-datasource',
        version: 'latest',
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
          sigV4Region: config.region,
          sigV4AssumeRoleArn: ampRole.arn,
        }),
      },
      { dependsOn: [plugin], parent: this },
    );
  }
}
