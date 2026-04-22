export type Panel = {
  title: string;
  gridPos: Panel.Position;
  type: string;
  datasource: string;
  targets: Target[];
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
    overrides?: {
      matcher: {
        id: string;
        options: string;
      };
      properties: {
        id: string;
        value:
          | string
          | { title: string; url: string; targetBlank: boolean }[]
          | { type: string };
      }[];
    };
  };
  transformations?: Transformation[];
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

export type Target = {
  expr?: string;
  expression?: string;
  legendFormat?: string;
  logGroups?: { name: string }[];
  queryMode?: string;
  queryType?: string;
  query?: string;
};

export type Metric = {
  label: string;
  query: string;
  thresholds: Threshold[];
};

export type Threshold = {
  value: number | null;
  color: string;
};

export type OrganizeTransformation = {
  id: 'organize';
  options: {
    renameByName?: Record<string, string>;
    excludeByName?: Record<string, boolean>;
    indexByName?: Record<string, number>;
  };
};

export type SortByTransformation = {
  id: 'sortBy';
  options: {
    sort: { field: string; desc: boolean }[];
  };
};

export type Transformation = OrganizeTransformation | SortByTransformation;
