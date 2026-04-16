import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import type { GrafanaDashboardBuilder } from './dashboards/builder';
import { GrafanaConnection } from './connections';
import { mergeWithDefaults } from '../../shared/merge-with-defaults';

const REQUIRED_ACCESS_POLICY_SCOPES = [
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
] as const;

const defaults = {
  serviceAccountTokenRotation: {
    secondsToLive: 7_776_000, // 90 days
    earlyRotationWindowSeconds: 604_800, // 7 days
  },
  accessPolicyTokenRotation: {
    expireAfter: '2160h', // 90 days
    earlyRotationWindow: '168h', // 7 days
  },
};

export namespace Grafana {
  export type ServiceAccountTokenRotation = {
    secondsToLive: number;
    earlyRotationWindowSeconds: number;
  };

  export type AccessPolicyTokenRotation = {
    expireAfter: string;
    earlyRotationWindow: string;
  };

  export type Args = {
    connectionBuilders: GrafanaConnection.CreateConnection[];
    dashboardBuilders: GrafanaDashboardBuilder.CreateDashboard[];
    folderName?: string;
    scopes?: string[];
    serviceAccountTokenRotation?: ServiceAccountTokenRotation;
    accessPolicyTokenRotation?: AccessPolicyTokenRotation;
  };
}

/**
 * This component requires a grafana cloud access policy token to be created and set
 * as `GRAFANA_CLOUD_ACCESS_POLICY_TOKEN` with the following scopes:
 * accesspolicies:read, accesspolicies:write, accesspolicies:delete, stacks:read, stack-service-accounts:write
 */
export class Grafana extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly stack: pulumi.Output<grafana.cloud.GetStackResult>;
  public readonly accessPolicy: grafana.cloud.AccessPolicy;
  public readonly accessPolicyToken: grafana.cloud.AccessPolicyRotatingToken;
  public readonly serviceAccount: grafana.cloud.StackServiceAccount;
  public readonly serviceAccountToken: grafana.cloud.StackServiceAccountRotatingToken;
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

    const argsWithDefaults = mergeWithDefaults(defaults, args);

    this.name = name;

    this.stack = grafana.cloud.getStackOutput({ slug: this.getStackSlug() });

    this.accessPolicy = this.createAccessPolicy(argsWithDefaults.scopes);
    this.accessPolicyToken = this.createAccessPolicyToken(
      argsWithDefaults.accessPolicyTokenRotation,
    );

    this.serviceAccount = this.createServiceAccount();
    this.serviceAccountToken = this.createServiceAccountToken(
      argsWithDefaults.serviceAccountTokenRotation,
    );

    this.provider = this.createProvider();

    this.connections = argsWithDefaults.connectionBuilders.map(build => {
      return build(
        { stack: this.stack },
        { parent: this, provider: this.provider },
      );
    });

    this.folder = this.createFolder(argsWithDefaults.folderName, this.provider);

    this.dashboards = argsWithDefaults.dashboardBuilders.map(build => {
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
        name: `ap-icb-observability-rwd-${pulumi.getStack()}`,
        scopes: [
          ...new Set([...REQUIRED_ACCESS_POLICY_SCOPES, ...(scopes ?? [])]),
        ],
        realms: [{ type: 'stack', identifier: this.stack.id }],
      },
      { parent: this },
    );
  }

  private createAccessPolicyToken(
    rotation: Grafana.AccessPolicyTokenRotation,
  ): grafana.cloud.AccessPolicyRotatingToken {
    return new grafana.cloud.AccessPolicyRotatingToken(
      `${this.name}-access-policy-token`,
      {
        region: this.stack.regionSlug,
        accessPolicyId: this.accessPolicy.policyId,
        namePrefix: `icb-${pulumi.getStack()}`,
        expireAfter: rotation.expireAfter,
        earlyRotationWindow: rotation.earlyRotationWindow,
        deleteOnDestroy: true,
      },
      { parent: this },
    );
  }

  private createServiceAccount(): grafana.cloud.StackServiceAccount {
    return new grafana.cloud.StackServiceAccount(
      `${this.name}-service-account`,
      {
        stackSlug: this.stack.slug,
        name: `sa-icb-provisioner-${pulumi.getStack()}`,
        role: 'Admin',
      },
      { parent: this },
    );
  }

  private createServiceAccountToken(
    rotation: Grafana.ServiceAccountTokenRotation,
  ): grafana.cloud.StackServiceAccountRotatingToken {
    return new grafana.cloud.StackServiceAccountRotatingToken(
      `${this.name}-service-account-token`,
      {
        stackSlug: this.stack.slug,
        serviceAccountId: this.serviceAccount.id,
        namePrefix: `icb-${pulumi.getStack()}`,
        secondsToLive: rotation.secondsToLive,
        earlyRotationWindowSeconds: rotation.earlyRotationWindowSeconds,
        deleteOnDestroy: true,
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
        cloudAccessPolicyToken: this.accessPolicyToken.token,
        url: this.stack.url,
        auth: this.serviceAccountToken.key,
      },
      { parent: this },
    );
  }
}
