import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import type { GrafanaDashboardBuilder } from './dashboards/builder';
import { GrafanaConnection } from './connections';

/**
 * Requires a predefined GRAFANA_CLOUD_ACCESS_POLICY_TOKEN with the following scopes:
 * accesspolicies:read, accesspolicies:write, accesspolicies:delete, stacks:read, stack-service-accounts:write
 */

export namespace Grafana {
  export type Args = {
    connectionBuilders: GrafanaConnection.CreateConnection[];
    dashboardBuilders: GrafanaDashboardBuilder.CreateDashboard[];
    folderName?: string;
    scopes?: string[];
  };
}

export class Grafana extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly stack: pulumi.Output<grafana.cloud.GetStackResult>;
  public readonly accessPolicy: grafana.cloud.AccessPolicy;
  public readonly accessPolicyToken: pulumi.Output<string>;
  public readonly serviceAccount: grafana.cloud.StackServiceAccount;
  public readonly serviceAccountToken: pulumi.Output<string>;
  public readonly provider: grafana.Provider;
  public readonly connections: GrafanaConnection[];
  public readonly folder: grafana.oss.Folder;
  public readonly dashboards: grafana.oss.Dashboard[];

  constructor(
    name: string,
    args: Grafana.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:grafana:Grafana', name, {}, opts);

    this.name = name;

    this.stack = grafana.cloud.getStackOutput({ slug: this.getStackSlug() });

    this.accessPolicy = this.createAccessPolicy(args.scopes);
    const accessPolicyToken = this.createAccessPolicyToken();
    this.accessPolicyToken = pulumi.secret(accessPolicyToken.token);

    this.serviceAccount = this.createServiceAccount();
    const serviceAccountToken = this.createServiceAccountToken();
    this.serviceAccountToken = pulumi.secret(serviceAccountToken.key);

    this.provider = this.createProvider();

    this.connections = args.connectionBuilders.map(build => {
      return build(
        { stack: this.stack },
        { parent: this, provider: this.provider },
      );
    });

    this.folder = this.createFolder(args.folderName, this.provider);

    this.dashboards = args.dashboardBuilders.map(build => {
      return build(this.folder, {
        parent: this.folder,
        provider: this.provider,
      });
    });

    this.registerOutputs();
  }

  private getStackSlug(): string {
    const grafanaConfig = new pulumi.Config('grafana');
    const grafanaUrl = grafanaConfig.get('url') ?? process.env.GRAFANA_URL;

    if (!grafanaUrl) {
      throw new Error(
        'Grafana URL is not configured. Set it via Pulumi config (grafana:url) or GRAFANA_URL env var.',
      );
    }

    return new URL(grafanaUrl).hostname.split('.')[0];
  }

  private createAccessPolicy(scopes?: string[]): grafana.cloud.AccessPolicy {
    return new grafana.cloud.AccessPolicy(
      `${this.name}-access-policy`,
      {
        region: this.stack.regionSlug,
        name: `${this.name}-access-policy`,
        scopes: [
          ...new Set([
            'accesspolicies:read',
            'accesspolicies:write',
            'accesspolicies:delete',
            'datasources:read',
            'datasources:write',
            'datasources:delete',
            'stacks:read',
            'stack-dashboards:read',
            'stack-dashboards:write',
            'stack-dashboards:delete',
            'stack-plugins:read',
            'stack-plugins:write',
            'stack-plugins:delete',
            ...(scopes ?? []),
          ]),
        ],
        realms: [{ type: 'stack', identifier: this.stack.id }],
      },
      { parent: this },
    );
  }

  private createAccessPolicyToken(): grafana.cloud.AccessPolicyToken {
    return new grafana.cloud.AccessPolicyToken(
      `${this.name}-access-policy-token`,
      {
        region: this.stack.regionSlug,
        accessPolicyId: this.accessPolicy.policyId,
        name: `${this.name}-icb-access-policy-token-${pulumi.getStack()}`,
      },
      { parent: this },
    );
  }

  private createServiceAccount(): grafana.cloud.StackServiceAccount {
    return new grafana.cloud.StackServiceAccount(
      `${this.name}-service-account`,
      {
        stackSlug: this.stack.slug,
        name: `${this.name}-icb-service-account-${pulumi.getStack()}`,
        role: 'Admin',
      },
      { parent: this },
    );
  }

  private createServiceAccountToken(): grafana.cloud.StackServiceAccountToken {
    return new grafana.cloud.StackServiceAccountToken(
      `${this.name}-service-account-token`,
      {
        stackSlug: this.stack.slug,
        serviceAccountId: this.serviceAccount.id,
        name: `${this.name}-icb-service-account-token-${pulumi.getStack()}`,
      },
      { parent: this },
    );
  }

  private createFolder(
    folderName: string | undefined,
    provider: grafana.Provider,
  ): grafana.oss.Folder {
    return new grafana.oss.Folder(
      `${this.name}-folder`,
      { title: folderName ?? `${this.name}-ICB-GENERATED` },
      { parent: this, provider },
    );
  }

  private createProvider(): grafana.Provider {
    return new grafana.Provider(
      `${this.name}-provider`,
      {
        cloudAccessPolicyToken: this.accessPolicyToken,
        url: this.stack.url,
        auth: this.serviceAccountToken,
      },
      { parent: this },
    );
  }
}
