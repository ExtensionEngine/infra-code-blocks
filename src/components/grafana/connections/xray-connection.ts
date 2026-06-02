import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { resolveAwsRegion } from '../../../shared/resolve-aws-region';
import { GrafanaConnection } from './connection';

export namespace XRayConnection {
  export type Args = GrafanaConnection.Args & {
    region?: pulumi.Input<string>;
  };
}

export class XRayConnection extends GrafanaConnection {
  public readonly name: string;
  public readonly dataSource: grafana.oss.DataSource;
  public readonly rolePolicy: aws.iam.RolePolicy;

  constructor(
    name: string,
    args: XRayConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:XRayConnection', name, args, opts);

    const region = resolveAwsRegion(args, this);

    this.name = name;

    this.rolePolicy = this.createRolePolicy();

    this.dataSource = this.createDataSource(region);

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

  private createDataSource(
    region: XRayConnection.Args['region'],
  ): grafana.oss.DataSource {
    return new grafana.oss.DataSource(
      `${this.name}-x-ray-datasource`,
      {
        name: this.dataSourceName,
        type: 'grafana-x-ray-datasource',
        jsonDataEncoded: pulumi.jsonStringify({
          authType: 'grafana_assume_role',
          assumeRoleArn: this.role.arn,
          defaultRegion: region,
        }),
      },
      { parent: this },
    );
  }
}
