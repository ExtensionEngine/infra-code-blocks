import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { mergeWithDefaults } from '../../../shared/merge-with-defaults';
import { GrafanaConnection } from './connection';

const awsConfig = new pulumi.Config('aws');

export namespace AMPConnection {
  export type Args = GrafanaConnection.Args & {
    endpoint: pulumi.Input<string>;
    region?: string;
  };
}

const defaults = {
  region: awsConfig.require('region'),
};

/**
 * This component requires grafana-amazonprometheus-datasource plugin to be installed
 */
export class AMPConnection extends GrafanaConnection {
  public readonly name: string;
  public readonly dataSource: grafana.oss.DataSource;
  public readonly rolePolicy: aws.iam.RolePolicy;

  constructor(
    name: string,
    args: AMPConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:AMPConnection', name, args, opts);

    const argsWithDefaults = mergeWithDefaults(defaults, args);

    this.name = name;

    this.rolePolicy = this.createRolePolicy();

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

  private createDataSource(
    region: string,
    endpoint: AMPConnection.Args['endpoint'],
  ): grafana.oss.DataSource {
    return new grafana.oss.DataSource(
      `${this.name}-amp-datasource`,
      {
        name: this.dataSourceName,
        type: 'grafana-amazonprometheus-datasource',
        url: endpoint,
        jsonDataEncoded: pulumi.jsonStringify({
          sigV4Auth: true,
          sigV4AuthType: 'grafana_assume_role',
          sigV4Region: region,
          sigV4AssumeRoleArn: this.role.arn,
        }),
      },
      { parent: this },
    );
  }
}
