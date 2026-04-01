import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { Panel } from '../panels/types';
import { mergeWithDefaults } from '../../../shared/merge-with-defaults';

export namespace GrafanaDashboardBuilder {
  export type Config = {
    timezone?: string;
    refresh?: string;
  };

  export type CreateDashboard = (
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
  private readonly panels: Panel[] = [];
  private configuration: GrafanaDashboardBuilder.Config = {};
  private title?: string;

  constructor(name: string) {
    this.name = name;
  }

  withTitle(title: string): this {
    this.title = title;

    return this;
  }

  withConfig(options: GrafanaDashboardBuilder.Config): this {
    this.configuration = options;

    return this;
  }

  addPanel(panel: Panel): this {
    this.panels.push(panel);

    return this;
  }

  build(): GrafanaDashboardBuilder.CreateDashboard {
    if (!this.title) {
      throw new Error('Title is required. Call withTitle() to set a title.');
    }

    if (!this.panels.length) {
      throw new Error(
        'At least one panel is required. Call addPanel() to add a panel.',
      );
    }

    const { name, title, panels } = this;
    const options = mergeWithDefaults(defaults, this.configuration);

    return (folder, opts) => {
      return new grafana.oss.Dashboard(
        `${name}-dashboard`,
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
