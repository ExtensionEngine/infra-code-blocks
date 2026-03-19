import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { commonTags } from '../../../shared/common-tags';

const grafanaConfig = new pulumi.Config('grafana');

export abstract class GrafanaConnection extends pulumi.ComponentResource {
  abstract readonly dataSource: grafana.oss.DataSource;
  readonly iamRole: aws.iam.Role;

  constructor(
    type: string,
    name: string,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super(type, name, {}, opts);

    this.iamRole = this.createIamRole(name);
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

  private createIamRole(name: string): aws.iam.Role {
    const grafanaAwsAccountId =
      grafanaConfig.get('awsAccountId') ?? process.env.GRAFANA_AWS_ACCOUNT_ID;

    if (!grafanaAwsAccountId) {
      throw new Error(
        'Grafana AWS Account ID is not configured. Set it via Pulumi config (grafana:awsAccountId) or GRAFANA_AWS_ACCOUNT_ID env var.',
      );
    }

    const stackSlug = this.getStackSlug();
    const grafanaStack = grafana.cloud.getStack({ slug: stackSlug });

    const assumeRolePolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: 'Allow',
          principals: [
            {
              type: 'AWS',
              identifiers: [`arn:aws:iam::${grafanaAwsAccountId}:root`],
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
      `${name}-grafana-iam-role`,
      {
        assumeRolePolicy: assumeRolePolicy.json,
        tags: commonTags,
      },
      { parent: this },
    );
  }
}
