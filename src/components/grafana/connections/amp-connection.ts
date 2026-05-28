import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { resolveAwsRegion } from '../../../shared/resolve-aws-region';
import { GrafanaConnection } from './connection';

export namespace AMPConnection {
  export type Args = GrafanaConnection.Args & {
    endpoint: pulumi.Input<string>;
    region?: pulumi.Input<string>;
  };
}

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

    const region = resolveAwsRegion(args, this);

    this.name = name;

    this.rolePolicy = this.createRolePolicy();

    this.dataSource = this.createDataSource(args.endpoint, region);

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
    endpoint: AMPConnection.Args['endpoint'],
    region: AMPConnection.Args['region'],
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
