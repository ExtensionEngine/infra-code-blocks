import * as pulumi from '@pulumi/pulumi';
import {
  AMPConnection,
  CloudWatchLogsConnection,
  GrafanaConnection,
  XRayConnection,
} from './connections';
import { Grafana } from './grafana';
import type { GrafanaDashboardBuilder } from './dashboards/builder';
import { createSloDashboard, SloDashboard } from './dashboards/slo';

export class GrafanaBuilder {
  private readonly name: string;
  private readonly connectionBuilders: GrafanaConnection.CreateConnection[] =
    [];
  private readonly dashboardBuilders: GrafanaDashboardBuilder.CreateDashboard[] =
    [];
  private readonly scopes: string[] = [];
  private folderName?: string;
  private serviceAccountTokenRotation?: Grafana.ServiceAccountTokenRotation;
  private accessPolicyTokenRotation?: Grafana.AccessPolicyTokenRotation;

  constructor(name: string) {
    this.name = name;
  }

  public withFolderName(folderName: string): this {
    this.folderName = folderName;

    return this;
  }

  public withServiceAccountTokenRotation(
    rotation: Grafana.ServiceAccountTokenRotation,
  ): this {
    this.serviceAccountTokenRotation = rotation;

    return this;
  }

  public withAccessPolicyTokenRotation(
    rotation: Grafana.AccessPolicyTokenRotation,
  ): this {
    this.accessPolicyTokenRotation = rotation;

    return this;
  }

  public addScope(...scopes: string[]): this {
    this.scopes.push(...scopes);

    return this;
  }

  public addAmp(name: string, args: Omit<AMPConnection.Args, 'stack'>): this {
    this.connectionBuilders.push(
      (ctx, opts) => new AMPConnection(name, { ...args, ...ctx }, opts),
    );

    return this;
  }

  public addCloudWatchLogs(
    name: string,
    args: Omit<CloudWatchLogsConnection.Args, 'stack'>,
  ): this {
    this.connectionBuilders.push(
      (ctx, opts) =>
        new CloudWatchLogsConnection(name, { ...args, ...ctx }, opts),
    );

    return this;
  }

  public addXRay(name: string, args: Omit<XRayConnection.Args, 'stack'>): this {
    this.connectionBuilders.push(
      (ctx, opts) => new XRayConnection(name, { ...args, ...ctx }, opts),
    );

    return this;
  }

  public addConnection(builder: GrafanaConnection.CreateConnection): this {
    this.connectionBuilders.push(builder);

    return this;
  }

  public addSloDashboard(config: SloDashboard.Args): this {
    this.dashboardBuilders.push(createSloDashboard(config));

    return this;
  }

  public addDashboard(
    dashboard: GrafanaDashboardBuilder.CreateDashboard,
  ): this {
    this.dashboardBuilders.push(dashboard);

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Grafana {
    if (!this.connectionBuilders.length) {
      throw new Error(
        'At least one connection is required. Call addConnection() to add a custom connection or use one of the existing connection builders.',
      );
    }

    if (!this.dashboardBuilders.length) {
      throw new Error(
        'At least one dashboard is required. Call addDashboard() to add a custom dashboard or use one of the existing dashboard builders.',
      );
    }

    return new Grafana(
      this.name,
      {
        connectionBuilders: this.connectionBuilders,
        dashboardBuilders: this.dashboardBuilders,
        folderName: this.folderName,
        scopes: this.scopes,
        serviceAccountTokenRotation: this.serviceAccountTokenRotation,
        accessPolicyTokenRotation: this.accessPolicyTokenRotation,
      },
      opts,
    );
  }
}
