import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { mergeWithDefaults } from '../../../shared/merge-with-defaults';
import { GrafanaConnection } from './connection';

const awsConfig = new pulumi.Config('aws');

export namespace CloudWatchLogsConnection {
  export type Args = GrafanaConnection.Args & {
    logGroupName: string;
    region?: string;
  };
}

const defaults = {
  region: awsConfig.require('region'),
};

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

    const argsWithDefaults = mergeWithDefaults(defaults, args);

    this.name = name;

    this.rolePolicy = this.createRolePolicy();
    this.dataSource = this.createDataSource(
      argsWithDefaults.logGroupName,
      argsWithDefaults.region,
    );

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
    logGroupName: CloudWatchLogsConnection.Args['logGroupName'],
    region: string,
  ): grafana.oss.DataSource {
    const dataSourceName = `${this.name}-cloudwatch-logs-datasource`;

    return new grafana.oss.DataSource(
      dataSourceName,
      {
        name: dataSourceName,
        type: 'cloudwatch',
        jsonDataEncoded: pulumi.jsonStringify({
          authType: 'grafana_assume_role',
          assumeRoleArn: this.role.arn,
          defaultRegion: region,
          defaultLogGroups: [logGroupName],
        }),
      },
      { parent: this },
    );
  }
}
