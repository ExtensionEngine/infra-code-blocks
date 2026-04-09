import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { commonTags } from '../../../shared/common-tags';

export namespace GrafanaConnection {
  export type Args = {
    awsAccountId: string;
    dataSourceName?: string;
    stack: pulumi.Input<grafana.cloud.GetStackResult>;
  };

  export type CreateConnectionContext = Pick<Args, 'stack'>;

  export type CreateConnection = (
    ctx: CreateConnectionContext,
    opts: pulumi.ComponentResourceOptions,
  ) => GrafanaConnection;
}

export abstract class GrafanaConnection extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly role: aws.iam.Role;
  public abstract readonly dataSource: grafana.oss.DataSource;
  protected readonly dataSourceName: string;
  protected readonly stack: pulumi.Output<grafana.cloud.GetStackResult>;

  constructor(
    type: string,
    name: string,
    args: GrafanaConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super(type, name, {}, opts);

    this.name = name;
    this.dataSourceName = args.dataSourceName ?? `${name}-datasource`;
    this.stack = pulumi.output(args.stack);
    this.role = this.createIamRole(args.awsAccountId);

    this.registerOutputs();
  }

  private createIamRole(awsAccountId: string): aws.iam.Role {
    const assumeRolePolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: 'Allow',
          principals: [
            {
              type: 'AWS',
              identifiers: [`arn:aws:iam::${awsAccountId}:root`],
            },
          ],
          actions: ['sts:AssumeRole'],
          conditions: [
            {
              test: 'StringEquals',
              variable: 'sts:ExternalId',
              values: [this.stack.id],
            },
          ],
        },
      ],
    });

    return new aws.iam.Role(
      `${this.name}-grafana-iam-role`,
      {
        assumeRolePolicy: assumeRolePolicy.json,
        tags: commonTags,
      },
      { parent: this },
    );
  }
}
