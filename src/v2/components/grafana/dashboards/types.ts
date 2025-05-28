import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';

// TODO: Should we prefix all namespaces with `Studion`
export namespace Grafana {
  // TODO: Create SLO abstraction that enables configuring:
  // - panels (long-window SLI, long-window error budget)
  // - alerts (long-window burn, short-window burn)
  export type Threshold = {
    value: number | null;
    color: string;
  };
  export type Metric = {
    label: string;
    query: string;
    thresholds: Threshold[];
  };

  export type Args = {
    title: pulumi.Input<string>;
    provider: pulumi.Input<grafana.Provider>;
    tags: pulumi.Input<pulumi.Input<string>[]>;
  };

  export type Panel = {
    title: string;
    gridPos: Panel.Position;
    type: string;
    datasource: string;
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
          lineInterpolation?: string,
          spanNulls: boolean
        }
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
  }

  export namespace Panel {
    export type Position = {
      x: number;
      y: number;
      w: number;
      h: number;
    }
  }
}
