import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { commonTags } from '../../../shared/common-tags';

const grafanaConfig = new pulumi.Config('grafana');

export namespace GrafanaConnection {
  export type Args = {
    awsAccountId: string;
  };

  export type ConnectionBuilder = (
    opts: pulumi.ComponentResourceOptions,
  ) => GrafanaConnection;
}

export abstract class GrafanaConnection extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly role: aws.iam.Role;
  public abstract readonly dataSource: grafana.oss.DataSource;

  constructor(
    type: string,
    name: string,
    args: GrafanaConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super(type, name, {}, opts);

    this.name = name;

    this.role = this.createIamRole(args.awsAccountId);

    this.registerOutputs();
  }

  protected getStackSlug(): string {
    const grafanaUrl = grafanaConfig.get('url') ?? process.env.GRAFANA_URL;

    if (!grafanaUrl) {
      throw new Error(
        'Grafana URL is not configured. Set it via Pulumi config (grafana:url) or GRAFANA_URL env var.',
      );
    }

    return new URL(grafanaUrl).hostname.split('.')[0];
  }

  private createIamRole(awsAccountId: string): aws.iam.Role {
    const stackSlug = this.getStackSlug();
    const grafanaStack = grafana.cloud.getStack({ slug: stackSlug });

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
              values: [pulumi.output(grafanaStack).id],
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
