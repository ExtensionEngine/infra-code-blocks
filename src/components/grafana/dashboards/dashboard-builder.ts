import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import { GrafanaConnection } from '../connections';
import { GrafanaDashboard } from './types';
import { Panel, PanelBuilder } from '../panels/types';

export class DashboardBuilder {
  private title: pulumi.Input<string>;
  private panelBuilders: PanelBuilder[] = [];

  constructor(args: { title: pulumi.Input<string> }) {
    this.title = args.title;
  }

  addPanel(builder: PanelBuilder): this {
    this.panelBuilders.push(builder);
    return this;
  }

  build(connections: GrafanaConnection[]): GrafanaDashboard.DashboardConfig {
    const { title, panelBuilders } = this;
    const panels = panelBuilders.map(build => build(connections));

    return {
      createResource(name, folder, opts) {
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
