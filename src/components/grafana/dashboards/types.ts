import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaConnection } from '../connections';

export namespace GrafanaDashboard {
  export type Args = {
    title: string;
  };

  export interface DashboardConfig {
    createResource(
      connections: GrafanaConnection[],
      folder?: grafana.oss.Folder,
      opts?: pulumi.ComponentResourceOptions,
    ): grafana.oss.Dashboard;
  }
}
