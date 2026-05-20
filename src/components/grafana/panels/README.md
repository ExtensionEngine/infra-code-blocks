# `src/components/grafana/panels`

The `grafana.panels` namespace provides JSON-ready panel types and helper functions for custom dashboards, the built-in SLO dashboard, and the built-in logs/traces dashboard.

Use it to assemble reusable stat, time-series, table, traces, burn-rate, availability, success-rate, and latency panels that plug into `grafana.dashboard.DashboardBuilder`.

## Usage examples

### Happy path

```ts
import * as studion from '@studion/infra-code-blocks';

const overviewDashboard = new studion.grafana.dashboard.DashboardBuilder(
  'platform-overview',
)
  .withTitle('Platform Overview')
  .addPanel(
    studion.grafana.panels.createTimeSeriesPanel(
      'Request Volume',
      { x: 0, y: 0, w: 12, h: 8 },
      'metrics-datasource',
      {
        label: 'RPS',
        query: 'sum(rate(http_requests_total[5m]))',
        thresholds: [],
      },
      'reqps',
      0,
    ),
  )
  .build();

export const dashboardFactory = overviewDashboard;
```

### Non-trivial scenario

```ts
import * as studion from '@studion/infra-code-blocks';

const sloSummaryDashboard = new studion.grafana.dashboard.DashboardBuilder(
  'service-slo-summary',
)
  .withTitle('Service SLO Summary')
  .addPanel(
    studion.grafana.panels.createAvailabilityPanel({
      target: 0.99,
      window: '30d',
      ampNamespace: 'api',
      dataSourceName: 'metrics-datasource',
    }),
  )
  .addPanel(
    studion.grafana.panels.createSuccessRateTimeSeriesPanel({
      shortWindow: '5m',
      filter: 'route="/api"',
      ampNamespace: 'api',
      dataSourceName: 'metrics-datasource',
    }),
  )
  .addPanel(
    studion.grafana.panels.createLatencyPercentilePanel({
      target: 0.99,
      shortWindow: '5m',
      filter: 'route="/api"',
      ampNamespace: 'api',
      dataSourceName: 'metrics-datasource',
    }),
  )
  .build();

export const dashboardFactory = sloSummaryDashboard;
```

## Implementation notes

- Generic panel helpers return plain JSON-ready objects; they do not create Pulumi or Grafana resources by themselves.
- `createStatPercentagePanel()` always returns a `stat` panel with one target and percentage field defaults: `unit: 'percent'`, `min: 0`, and `max: 100`.
- `createTimeSeriesPanel()` always returns a `timeseries` panel with one target and includes `unit`, `min`, and `max` keys even when their values are `undefined`.
- `createTimeSeriesPercentagePanel()` is a thin wrapper over `createTimeSeriesPanel()` that passes the same percentage defaults.
- `createTablePanel()` returns a `table` panel and passes through caller-supplied `Target[]`, `Transformation[]`, and `Override[]` values.
- `createTracesPanel()` returns a `traces` panel and passes through caller-supplied `Target[]` values.
- Generic stat and time-series helpers add `thresholds: { mode: 'absolute', steps: metric.thresholds }` whenever `metric.thresholds` is truthy; an empty array still emits a threshold block with no steps.
- `createBurnRatePanel()` ignores `metric.thresholds` and always returns a `stat` panel with `unit: 'none'`, `reduceOptions.calcs = ['last']`, `colorMode: 'value'`, `graphMode: 'none'`, `textMode: 'value'`, and fixed green/orange/red thresholds at `null`, `1`, and `2`.
- The availability, success-rate, and latency helpers each return fixed titles and fixed grid positions so they compose into the package's standard SLO dashboard layout.
- `createAvailabilityPanel()` accepts `target` for config-shape consistency, but the generated availability query itself does not use it.
- Some SLO panel titles are hard-coded with `250ms`; changing `targetLatency` changes the generated PromQL threshold but does not change those panel titles.
- Burn-rate panel helpers use a hard-coded `1h` PromQL range for the underlying availability, success-rate, and latency rate queries.
- `createLatencyBurnRatePanel()` follows its configuration shape and creates a namespace-wide latency burn-rate panel; use a custom generic panel when you need route or label filtered latency burn-rate visualization.
- `createSuccessRateBurnRatePanel()` always uses a `1h` rate window for the underlying success-rate query.
- `createLatencyPercentilePanel()` uses `target` as the percentile argument.
- The higher-level panel helpers delegate their PromQL generation to `src/components/prometheus` query helpers.

## API Reference

### `grafana.panels.Panel`

**Type**

```ts
type Panel = {
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
    overrides?: Override[];
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
```

**Field Summary**

| Property                                 | Description                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `title`\*<br/>`string`                   | Panel title written into dashboard JSON.                                                                             |
| `gridPos`\*<br/>`Panel.Position`         | Panel size and placement in Grafana's 24-column dashboard grid.                                                      |
| `type`\*<br/>`string`                    | Grafana panel plugin type. Helpers in this module emit `stat`, `timeseries`, `table`, or `traces`.                   |
| `datasource`\*<br/>`string`              | Grafana data source name referenced by the panel.                                                                    |
| `targets`\*<br/>`Target[]`               | Query targets rendered by the panel. Supports PromQL, CloudWatch Logs, and X-Ray-style target shapes.                |
| `fieldConfig`\*<br/>`{ defaults: ... }`  | Field-level display configuration, including units, min/max range, colors, thresholds, overrides, and custom values. |
| `transformations`<br/>`Transformation[]` | Grafana transformations applied to the panel result set, used by table-oriented panels.                              |
| `options`<br/>`{ ... }`                  | Visualization options such as stat text modes, graph display, and reducer settings.                                  |

**Supporting Types**

**`Panel.Position`**

```ts
type Position = {
  x: number;
  y: number;
  w: number;
  h: number;
};
```

| Property           | Description                 |
| ------------------ | --------------------------- |
| `x`\*<br/>`number` | Left grid offset.           |
| `y`\*<br/>`number` | Top grid offset.            |
| `w`\*<br/>`number` | Panel width in grid units.  |
| `h`\*<br/>`number` | Panel height in grid units. |

**Inline `Panel.fieldConfig` shape**

```ts
type PanelFieldConfig = {
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
  overrides?: Override[];
};
```

`PanelFieldConfig` is documentation-only shorthand for the inline `Panel.fieldConfig` object shape; it is not exported as a named type.

| Property                                         | Description                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `defaults`\*<br/>`{ ... }`                       | Grafana field defaults applied to every target rendered by the panel.                                              |
| `defaults.unit`<br/>`string`                     | Grafana unit identifier such as `percent`, `none`, or a custom Grafana unit string.                                |
| `defaults.min`<br/>`number`                      | Lower display bound for the field.                                                                                 |
| `defaults.max`<br/>`number`                      | Upper display bound for the field.                                                                                 |
| `defaults.color.mode`<br/>`string`               | Grafana color mode for the field.                                                                                  |
| `defaults.thresholds.mode`<br/>`string`          | Threshold interpretation mode. Helpers currently emit `absolute` when thresholds are used.                         |
| `defaults.thresholds.steps`<br/>`Threshold[]`    | Threshold steps used for color transitions.                                                                        |
| `defaults.custom`<br/>`{ ... }`                  | Time-series-specific custom field options.                                                                         |
| `defaults.custom.lineInterpolation`<br/>`string` | Grafana line interpolation mode for time-series panels.                                                            |
| `defaults.custom.spanNulls`<br/>`boolean`        | Whether null values are visually spanned in time-series panels when `custom` is provided. Required: Conditionally. |
| `overrides`<br/>`Override[]`                     | Field override rules, commonly used by table panels for links and display customizations.                          |

**Inline `Panel.options` shape**

```ts
type PanelOptions = {
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
```

`PanelOptions` is documentation-only shorthand for the inline `Panel.options` object shape; it is not exported as a named type.

| Property                             | Description                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `colorMode`<br/>`string`             | Stat-panel color mode, such as `value` for burn-rate panels.                         |
| `graphMode`<br/>`string`             | Stat-panel graph display mode, such as `none` for burn-rate panels.                  |
| `justifyMode`<br/>`string`           | Stat-panel text justification mode when used by custom panel definitions.            |
| `textMode`<br/>`string`              | Stat-panel text rendering mode, such as `value` for burn-rate panels.                |
| `reduceOptions`<br/>`{ ... }`        | Reducer configuration used by stat panels.                                           |
| `reduceOptions.calcs`<br/>`string[]` | Grafana reducer calculations; burn-rate helpers use `['last']`.                      |
| `reduceOptions.fields`<br/>`string`  | Field selector for reducer calculations; burn-rate helpers use an empty string.      |
| `reduceOptions.values`<br/>`boolean` | Whether reducer calculations operate over raw values; burn-rate helpers use `false`. |

### `grafana.panels.Metric`

**Type**

```ts
type Metric = {
  label: string;
  query: string;
  thresholds: Threshold[];
};
```

**Field Summary**

| Property                         | Description                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `label`\*<br/>`string`           | Query legend label copied to `targets[0].legendFormat`.                                       |
| `query`\*<br/>`string`           | PromQL or other data source query expression copied to `targets[0].expr`.                     |
| `thresholds`\*<br/>`Threshold[]` | Threshold steps passed to helper-generated `fieldConfig.defaults.thresholds.steps` when used. |

### `grafana.panels.Threshold`

**Type**

```ts
type Threshold = {
  value: number | null;
  color: string;
};
```

**Field Summary**

| Property                       | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| `value`\*<br/>`number \| null` | Threshold breakpoint; `null` represents the base step. |
| `color`\*<br/>`string`         | Grafana threshold color name.                          |

### `grafana.panels.Target`

**Type**

```ts
type Target = {
  expr?: string;
  expression?: string;
  legendFormat?: string;
  logGroups?: { name: pulumi.Input<string> }[];
  queryMode?: string;
  queryType?: string;
  query?: string;
};
```

**Field Summary**

| Property                                           | Description                                                  |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `expr`<br/>`string`                                | PromQL-style expression used by metric-oriented panels.      |
| `expression`<br/>`string`                          | CloudWatch Logs query expression used by logs table panels.  |
| `legendFormat`<br/>`string`                        | Legend label for metric-oriented targets.                    |
| `logGroups`<br/>`{ name: pulumi.Input<string> }[]` | CloudWatch log groups queried by logs table panels.          |
| `queryMode`<br/>`string`                           | Data-source-specific query mode, such as `Logs`.             |
| `queryType`<br/>`string`                           | Data-source-specific query type, such as X-Ray trace search. |
| `query`<br/>`string`                               | Data-source-specific query string used by traces panels.     |

### `grafana.panels.Override`

**Type**

```ts
type Override = {
  matcher: {
    id: string;
    options: string;
  };
  properties: {
    id: string;
    value: boolean | { title: string; url: string }[] | { type: string };
  }[];
};
```

**Field Summary**

| Property                                                                                     | Description                                                      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `matcher.id`\*<br/>`string`                                                                  | Grafana matcher identifier for selecting fields.                 |
| `matcher.options`\*<br/>`string`                                                             | Matcher-specific selector value.                                 |
| `properties`\*<br/>`{ ... }[]`                                                               | Field override properties applied to matching fields.            |
| `properties[].id`\*<br/>`string`                                                             | Grafana override property identifier.                            |
| `properties[].value`\*<br/>`boolean \| { title: string; url: string }[] \| { type: string }` | Override value, such as link definitions or custom cell display. |

### `grafana.panels.Transformation`

**Type**

```ts
type Transformation =
  | {
      id: 'organize';
      options: {
        renameByName?: Record<string, string>;
        excludeByName?: Record<string, boolean>;
        indexByName?: Record<string, number>;
      };
    }
  | {
      id: 'sortBy';
      options: {
        sort: { field: string; desc: boolean }[];
      };
    };
```

**Field Summary**

| Property                                                | Description                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`\*<br/>`'organize' \| 'sortBy'`                     | Grafana transformation identifier.                                         |
| `options.renameByName`<br/>`Record<string, string>`     | Field rename map for `organize` transformations.                           |
| `options.excludeByName`<br/>`Record<string, boolean>`   | Field exclusion map for `organize` transformations.                        |
| `options.indexByName`<br/>`Record<string, number>`      | Field ordering map for `organize` transformations.                         |
| `options.sort`<br/>`{ field: string; desc: boolean }[]` | Sort rules required for `sortBy` transformations. Required: Conditionally. |

### `grafana.panels` generic helper exports

**Signatures**

```ts
function createStatPercentagePanel(
  title: string,
  position: Panel.Position,
  dataSource: string,
  metric: Metric,
): Panel;
function createTimeSeriesPanel(
  title: string,
  position: Panel.Position,
  dataSource: string,
  metric: Metric,
  unit?: string,
  min?: number,
  max?: number,
): Panel;
function createTimeSeriesPercentagePanel(
  title: string,
  position: Panel.Position,
  dataSource: string,
  metric: Metric,
): Panel;
function createBurnRatePanel(
  title: string,
  position: Panel.Position,
  dataSource: string,
  metric: Metric,
): Panel;
function createTablePanel(
  title: string,
  position: Panel.Position,
  dataSource: string,
  targets: Target[],
  transformations?: Transformation[],
  overrides?: Override[],
): Panel;
function createTracesPanel(
  title: string,
  position: Panel.Position,
  dataSource: string,
  targets: Target[],
): Panel;
```

**Configuration Options**

| Parameter                                | Description                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `title`\*<br/>`string`                   | Panel title. Used by: All generic helpers.                                                                |
| `position`\*<br/>`Panel.Position`        | Grafana grid position copied to `gridPos`. Used by: All generic helpers.                                  |
| `dataSource`\*<br/>`string`              | Grafana data source name copied to `datasource`. Used by: All generic helpers.                            |
| `metric`\*<br/>`Metric`                  | Supplies the query, legend label, and thresholds for the generated panel target. Used by: Metric helpers. |
| `targets`\*<br/>`Target[]`               | Data-source-specific target list copied directly to the panel. Used by: Table/traces helpers.             |
| `transformations`<br/>`Transformation[]` | Optional Grafana transformations copied to the table panel. Used by: `createTablePanel`.                  |
| `overrides`<br/>`Override[]`             | Optional field overrides copied to `fieldConfig.overrides`. Used by: `createTablePanel`.                  |
| `unit`<br/>`string`                      | Optional Grafana unit for the time-series field config. Used by: `createTimeSeriesPanel`.                 |
| `min`<br/>`number`                       | Optional lower display bound for the time-series field config. Used by: `createTimeSeriesPanel`.          |
| `max`<br/>`number`                       | Optional upper display bound for the time-series field config. Used by: `createTimeSeriesPanel`.          |

**Return Value**

| Return type | Description                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `Panel`     | One JSON-ready Grafana panel object suitable for `DashboardBuilder.addPanel()` or direct dashboard JSON assembly. |

### `grafana.panels` availability helper exports

**Signatures**

```ts
function createAvailabilityPanel(config: {
  target: number;
  window: promQ.TimeRange;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
function createAvailabilityBurnRatePanel(config: {
  target: number;
  window: promQ.TimeRange;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
```

**Configuration Options**

Direct function input: `config`

| Property                         | Description                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `target`\*<br/>`number`          | SLO target ratio. Burn-rate helpers use it directly. Used by: Both availability helpers.                   |
| `window`\*<br/>`promQ.TimeRange` | PromQL range used by the summary or burn-rate panel query. Used by: Both availability helpers.             |
| `ampNamespace`\*<br/>`string`    | Metric namespace prefix passed to the Prometheus query helpers. Used by: Both availability helpers.        |
| `dataSourceName`\*<br/>`string`  | Grafana data source name copied to the generated panel's `datasource`. Used by: Both availability helpers. |

**Return Value**

| Return type | Description                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `Panel`     | One fixed-layout availability panel for the package-standard SLO dashboard. |

### `grafana.panels` success-rate helper exports

**Signatures**

```ts
function createSuccessRatePanel(config: {
  target: number;
  window: promQ.TimeRange;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
function createSuccessRateTimeSeriesPanel(config: {
  shortWindow: promQ.TimeRange;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
function createSuccessRateBurnRatePanel(config: {
  target: number;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
```

**Configuration Options**

Direct function input: `config`

| Property                              | Description                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `target`\*<br/>`number`               | SLO target ratio used by the burn-rate formula. Used by: `createSuccessRatePanel`, `createSuccessRateBurnRatePanel`. |
| `window`\*<br/>`promQ.TimeRange`      | Long PromQL range used by the summary stat panel. Used by: `createSuccessRatePanel`.                                 |
| `shortWindow`\*<br/>`promQ.TimeRange` | Short PromQL range used by the time-series panel. Used by: `createSuccessRateTimeSeriesPanel`.                       |
| `filter`\*<br/>`string`               | Prometheus label selector fragment appended to request metrics. Used by: All success-rate helpers.                   |
| `ampNamespace`\*<br/>`string`         | Metric namespace prefix passed to the Prometheus query helpers. Used by: All success-rate helpers.                   |
| `dataSourceName`\*<br/>`string`       | Grafana data source name copied to the generated panel's `datasource`. Used by: All success-rate helpers.            |

**Return Value**

| Return type | Description                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `Panel`     | One fixed-layout success-rate panel for the package-standard SLO dashboard. |

### `grafana.panels` latency helper exports

**Signatures**

```ts
function createLatencyPanel(config: {
  target: number;
  window: promQ.TimeRange;
  targetLatency: number;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
function createLatencyPercentilePanel(config: {
  target: number;
  shortWindow: promQ.TimeRange;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
function createLatencyPercentagePanel(config: {
  targetLatency: number;
  shortWindow: promQ.TimeRange;
  filter: string;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
function createLatencyBurnRatePanel(config: {
  target: number;
  targetLatency: number;
  ampNamespace: string;
  dataSourceName: string;
}): Panel;
```

**Configuration Options**

Direct function input: `config`

| Property                              | Description                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `target`\*<br/>`number`               | SLO target ratio; `createLatencyPercentilePanel()` uses it as the quantile. Used by: `createLatencyPanel`, `createLatencyPercentilePanel`, `createLatencyBurnRatePanel`. |
| `window`\*<br/>`promQ.TimeRange`      | Long PromQL range used by the summary stat panel. Used by: `createLatencyPanel`.                                                                                         |
| `shortWindow`\*<br/>`promQ.TimeRange` | Short PromQL range used by the time-series panels. Used by: `createLatencyPercentilePanel`, `createLatencyPercentagePanel`.                                              |
| `targetLatency`\*<br/>`number`        | Millisecond bucket threshold used by latency compliance queries. Used by: `createLatencyPanel`, `createLatencyPercentagePanel`, `createLatencyBurnRatePanel`.            |
| `filter`\*<br/>`string`               | Prometheus label selector fragment appended to request metrics. Used by: `createLatencyPanel`, `createLatencyPercentilePanel`, `createLatencyPercentagePanel`.           |
| `ampNamespace`\*<br/>`string`         | Metric namespace prefix passed to the Prometheus query helpers. Used by: All latency helpers.                                                                            |
| `dataSourceName`\*<br/>`string`       | Grafana data source name copied to the generated panel's `datasource`. Used by: All latency helpers.                                                                     |

**Return Value**

| Return type | Description                                                            |
| ----------- | ---------------------------------------------------------------------- |
| `Panel`     | One fixed-layout latency panel for the package-standard SLO dashboard. |
