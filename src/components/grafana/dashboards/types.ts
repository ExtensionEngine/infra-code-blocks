import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';

// TODO: Create SLO abstraction that enables configuring:
// - panels (long-window SLI, long-window error budget)
// - alerts (long-window burn, short-window burn)
export namespace GrafanaDashboard {
  export type DataSources = {
    prometheus?: pulumi.Output<string>;
  };

  export interface DashboardConfig {
    createResource(dataSources: DataSources): grafana.oss.Dashboard;
  }

  export type Args = {
    title: pulumi.Input<string>;
  };

  export type Panel = {
    title: string;
    gridPos: PanelPosition;
    type: string;
    datasource: pulumi.Input<string>;
    targets: {
      expr: string;
      legendFormat: string;
    }[];
    fieldConfig: {
      defaults: {
        unit?: string;
        min?: number;
        max?: number;
        color?: {
          mode: string;
        };
        thresholds?: {
          mode: string;
          steps: Threshold[];
        };
        custom?: {
          lineInterpolation?: string;
          spanNulls: boolean;
        };
      };
    };
    options?: {
      colorMode?: string;
      graphMode?: string;
      justifyMode?: string;
      textMode?: string;
      reduceOptions?: {
        calcs?: string[];
        fields?: string;
        values?: boolean;
      };
    };
  };

  export type PanelPosition = {
    x: number;
    y: number;
    w: number;
    h: number;
  };

  export type Threshold = {
    value: number | null;
    color: string;
  };

  export type Metric = {
    label: string;
    query: string;
    thresholds: Threshold[];
  };
}
