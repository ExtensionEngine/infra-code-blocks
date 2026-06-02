import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { resolveAwsRegion } from '../../../shared/resolve-aws-region';
import { GrafanaConnection } from './connection';

export namespace CloudWatchLogsConnection {
  export type Args = GrafanaConnection.Args & {
    region?: pulumi.Input<string>;
  };
}

export class CloudWatchLogsConnection extends GrafanaConnection {
  public readonly name: string;
  public readonly dataSource: grafana.oss.DataSource;
  public readonly rolePolicy: aws.iam.RolePolicy;

  constructor(
    name: string,
    args: CloudWatchLogsConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:CloudWatchLogsConnection', name, args, opts);

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
            'logs:DescribeLogGroups',
            'logs:GetLogGroupFields',
            'logs:StartQuery',
            'logs:StopQuery',
            'logs:GetQueryResults',
            'logs:GetLogEvents',
          ],
          resources: ['*'],
        },
      ],
    });

    return new aws.iam.RolePolicy(
      `${this.name}-cloudwatch-logs-policy`,
      {
        role: this.role.id,
        policy: policy.json,
      },
      { parent: this },
    );
  }

  private createDataSource(
    region: CloudWatchLogsConnection.Args['region'],
  ): grafana.oss.DataSource {
    return new grafana.oss.DataSource(
      `${this.name}-cloudwatch-logs-datasource`,
      {
        name: this.dataSourceName,
        type: 'cloudwatch',
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
