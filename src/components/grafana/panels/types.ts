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

export namespace Panel {
  export type Position = {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export type Metric = {
  label: string;
  query: string;
  thresholds: Threshold[];
};

export type Threshold = {
  value: number | null;
  color: string;
};
