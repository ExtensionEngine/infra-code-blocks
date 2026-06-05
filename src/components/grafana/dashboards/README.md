# `src/components/grafana/dashboards`

The `grafana.dashboard` namespace provides builder and factory helpers for creating Grafana dashboard resources from JSON-ready panel and variable definitions.

Use `DashboardBuilder` for custom dashboards, `createSloDashboard()` for the package-standard SLO dashboard, and `createLogsAndTracesDashboard()` for the package-standard logs and traces dashboard.

## Usage examples

### Happy path

```ts
import * as studion from '@studion/infra-code-blocks';

const dashboard = new studion.grafana.dashboard.DashboardBuilder(
  'service-overview',
)
  .withTitle('Service Overview')
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
    ),
  )
  .build();

export const dashboardFactory = dashboard;
```

### Non-trivial scenario

```ts
import * as studion from '@studion/infra-code-blocks';

const logsAndTracesDashboard =
  studion.grafana.dashboard.createLogsAndTracesDashboard({
    name: 'platform-logs-traces',
    title: 'Platform Logs & Traces',
    logsDataSourceName: 'logs-datasource',
    logGroupName: '/aws/ecs/platform-api',
    tracesDataSourceName: 'traces-datasource',
    dashboardConfig: {
      timezone: 'utc',
      refresh: '1m',
    },
  });

const customDashboard = new studion.grafana.dashboard.DashboardBuilder(
  'platform-custom',
)
  .withTitle('Platform Custom')
  .addVariable(
    studion.grafana.variables.searchQuery.createSearchVariable({
      description: 'Search logs by message text',
    }),
  )
  .addPanel(
    studion.grafana.panels.createTablePanel(
      'Recent Logs',
      { x: 0, y: 0, w: 24, h: 12 },
      'logs-datasource',
      [
        {
          expression: 'fields @timestamp, @message | limit 20',
          queryMode: 'Logs',
        },
      ],
    ),
  )
  .build();

export const dashboardFactories = [logsAndTracesDashboard, customDashboard];
```

## Implementation notes

- `GrafanaDashboardBuilder.build()` throws unless both a title and at least one panel have been provided.
- `GrafanaDashboardBuilder.withConfig()` overwrites the builder's stored dashboard configuration object; defaults are merged only during `build()`.
- `build()` returns a factory function, not a dashboard resource. The factory creates `grafana.oss.Dashboard` named `${name}-dashboard` when called by `Grafana`, optionally assigning `folder.uid` to the dashboard.
- Default dashboard configuration is `timezone: 'browser'` and `refresh: '10s'`. Partial dashboard config objects preserve omitted defaults.
- Dashboard JSON is produced with `pulumi.jsonStringify({ title, timezone, refresh, panels, templating: { list: variables } })`, so panel objects and dashboard variables are passed through exactly as accumulated by `addPanel()` and `addVariable()`.
- `createSloDashboard()` composes fixed SLO panels from `grafana.panels` helpers and Prometheus query helpers.
- `createSloDashboard()` defaults to `target: 0.99`, `window: '30d'`, `shortWindow: '5m'`, `targetLatency: 250`, and no dashboard-config overrides.
- The latency burn-rate panel created by `createSloDashboard()` follows the current `createLatencyBurnRatePanel()` configuration shape: it is namespace-wide and does not add the dashboard `filter`. Use a custom `DashboardBuilder` panel when you need route or label filtered latency burn-rate visualization.
- `createLogsAndTracesDashboard()` composes dashboard variables, a logs table panel, and a traces panel.
- `createLogsAndTracesDashboard()` defaults the title to `'Logs & Traces'` and dashboard config to `{ refresh: '1m' }`, which overrides the builder's default `refresh: '10s'` while leaving other builder defaults, such as `timezone: 'browser'`, in place. If you supply partial `dashboardConfig` values, omitted fields keep their defaults.

## API Reference

### `grafana.dashboard.DashboardBuilder`

**Signature**

```ts
class DashboardBuilder {
  constructor(name: string);
}
```

**Constructor Parameters**

| Parameter             | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `name`\*<br/>`string` | Dashboard name prefix used when `build()` creates the Grafana resource. |

**Builder Methods**

| Method        | Parameters                         | Description                                                                |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| `withConfig`  | `options: DashboardBuilder.Config` | Replaces the dashboard-level config merged with defaults during `build()`. |
| `withTitle`   | `title: string`                    | Sets the required Grafana dashboard title.                                 |
| `addVariable` | `variable: Variable`               | Appends a dashboard variable emitted through `templating.list`.            |
| `addPanel`    | `panel: Panel`                     | Appends one JSON-ready panel object to the dashboard.                      |
| `build`       | none                               | Validates title and panels, then returns a dashboard factory callback.     |

**Build Result**

```ts
build(): DashboardBuilder.CreateDashboard
```

| Return type                        | Description                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `DashboardBuilder.CreateDashboard` | Factory callback that creates a `grafana.oss.Dashboard` when called with an optional folder and opts. |

**Supporting Types**

**`DashboardBuilder.Config`**

```ts
type Config = {
  timezone?: string;
  refresh?: string;
};
```

| Property                | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `timezone`<br/>`string` | Grafana dashboard timezone. Default: `'browser'`.  |
| `refresh`<br/>`string`  | Dashboard auto-refresh interval. Default: `'10s'`. |

**`DashboardBuilder.CreateDashboard`**

```ts
type CreateDashboard = (
  folder?: grafana.oss.Folder,
  opts?: pulumi.ComponentResourceOptions,
) => grafana.oss.Dashboard;
```

| Parameter                                    | Description                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `folder`<br/>`grafana.oss.Folder`            | Optional Grafana folder whose UID is assigned to the generated dashboard resource. |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi resource options for the dashboard resource.                       |

<br />

| Return type             | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `grafana.oss.Dashboard` | Dashboard resource created from the builder's accumulated title, config, and panels. |

### `grafana.dashboard.createSloDashboard`

**Signature**

```ts
function createSloDashboard(
  config: SloDashboard.Args,
): DashboardBuilder.CreateDashboard;
```

**Configuration Options**

Direct function input: `config: SloDashboard.Args`

| Property                                        | Description                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`\*<br/>`string`                           | Unique dashboard name prefix; the created `grafana.oss.Dashboard` is named `${name}-dashboard`.                                            |
| `title`\*<br/>`string`                          | Grafana dashboard title.                                                                                                                   |
| `ampNamespace`\*<br/>`string`                   | Metric namespace prefix passed to the Prometheus query helpers.                                                                            |
| `filter`\*<br/>`string`                         | Prometheus label selector fragment used by most generated SLO queries.                                                                     |
| `dataSourceName`\*<br/>`string`                 | Grafana data source name referenced by the generated panels.                                                                               |
| `target`<br/>`number`                           | SLO target ratio. Default: `0.99`.                                                                                                         |
| `window`<br/>`promQ.TimeRange`                  | Long PromQL range used by summary panels. Default: `'30d'`.                                                                                |
| `shortWindow`<br/>`promQ.TimeRange`             | Short PromQL range used by time-series panels. Default: `'5m'`.                                                                            |
| `targetLatency`<br/>`number`                    | Millisecond latency bucket threshold used by latency compliance queries. Default: `250`.                                                   |
| `dashboardConfig`<br/>`DashboardBuilder.Config` | Dashboard-level settings merged over the builder defaults before `build()` runs. Partial configs preserve omitted defaults. Default: `{}`. |

**Return Value**

| Return type                        | Description                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `DashboardBuilder.CreateDashboard` | Dashboard factory compatible with `Grafana.Args.dashboardBuilders` and `GrafanaBuilder.addDashboard()`. |

### `grafana.dashboard.createLogsAndTracesDashboard`

**Signature**

```ts
function createLogsAndTracesDashboard(
  config: LogsAndTracesDashboard.Args,
): DashboardBuilder.CreateDashboard;
```

**Configuration Options**

Direct function input: `config: LogsAndTracesDashboard.Args`

| Property                                        | Description                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`\*<br/>`string`                           | Unique dashboard name prefix; the created `grafana.oss.Dashboard` is named `${name}-dashboard`.                                                           |
| `title`<br/>`string`                            | Grafana dashboard title. Default: `'Logs & Traces'`.                                                                                                      |
| `logsDataSourceName`\*<br/>`string`             | Grafana CloudWatch Logs data source name referenced by the logs table panel.                                                                              |
| `logGroupName`\*<br/>`pulumi.Input<string>`     | CloudWatch log group name queried by the logs table panel.                                                                                                |
| `tracesDataSourceName`\*<br/>`string`           | Grafana X-Ray data source name referenced by trace links and the traces panel.                                                                            |
| `dashboardConfig`<br/>`DashboardBuilder.Config` | Dashboard-level settings merged over the builder defaults before `build()` runs. Partial configs preserve omitted defaults. Default: `{ refresh: '1m' }`. |

**Return Value**

| Return type                        | Description                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `DashboardBuilder.CreateDashboard` | Dashboard factory compatible with `Grafana.Args.dashboardBuilders` and `GrafanaBuilder.addDashboard()`. |
