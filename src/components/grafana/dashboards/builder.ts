import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaDashboard } from './types';
import { PanelBuilder } from '../panels/types';

export class DashboardBuilder {
  private title: pulumi.Input<string>;
  private readonly panelBuilders: PanelBuilder[] = [];

  constructor(args: { title: pulumi.Input<string> }) {
    this.title = args.title;
  }

  addPanel(builder: PanelBuilder): this {
    this.panelBuilders.push(builder);

    return this;
  }

  build(): GrafanaDashboard.DashboardConfig {
    if (!this.panelBuilders.length) {
      throw new Error(
        'At least one panel is required. Call addPanel() to add a panel.',
      );
    }

    const { title, panelBuilders } = this;

    return {
      createResource(name, connections, folder, opts) {
        const panels = panelBuilders.map(build => build(connections));
        return new grafana.oss.Dashboard(
          name,
          {
            folder: folder?.uid,
            configJson: pulumi.jsonStringify({
              title,
              timezone: 'browser',
              refresh: '10s',
              panels,
            }),
          },
          { parent: folder, ...opts },
        );
      },
    };
  }
}
