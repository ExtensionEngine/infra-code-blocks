import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaConnection } from '../connections';
import { PanelBuilder } from '../panels/types';
import { mergeWithDefaults } from '../../../shared/merge-with-defaults';

export namespace GrafanaDashboardBuilder {
  export type Config = {
    timezone?: string;
    refresh?: string;
  };

  export type CreateDashboard = (
    connections: GrafanaConnection[],
    folder?: grafana.oss.Folder,
    opts?: pulumi.ComponentResourceOptions,
  ) => grafana.oss.Dashboard;
}

const defaults = {
  timezone: 'browser',
  refresh: '10s',
};

export class GrafanaDashboardBuilder {
  private readonly name: string;
  private readonly title: string;
  private readonly panelBuilders: PanelBuilder[] = [];
  private configuration: GrafanaDashboardBuilder.Config = {};

  constructor(name: string, title: string) {
    this.name = name;
    this.title = title;
  }

  withConfig(options: GrafanaDashboardBuilder.Config): this {
    this.configuration = options;

    return this;
  }

  addPanel(builder: PanelBuilder): this {
    this.panelBuilders.push(builder);

    return this;
  }

  build(): GrafanaDashboardBuilder.CreateDashboard {
    if (!this.panelBuilders.length) {
      throw new Error(
        'At least one panel is required. Call addPanel() to add a panel.',
      );
    }

    const { name, title, panelBuilders } = this;
    const options = mergeWithDefaults(defaults, this.configuration);

    return (connections, folder, opts) => {
      const panels = panelBuilders.map(build => build(connections));
      return new grafana.oss.Dashboard(
        name,
        {
          folder: folder?.uid,
          configJson: pulumi.jsonStringify({
            title,
            timezone: options.timezone,
            refresh: options.refresh,
            panels,
          }),
        },
        opts,
      );
    };
  }
}
