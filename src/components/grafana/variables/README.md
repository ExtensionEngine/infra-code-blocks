# `src/components/grafana/variables`

The `grafana.variables` namespace provides JSON-ready Grafana dashboard variable types and helper functions used by `grafana.dashboard.DashboardBuilder` and the built-in logs/traces dashboard.

Use these helpers when you want reusable dashboard variables without hand-authoring Grafana `templating.list` entries.

## Usage examples

### Happy path

```ts
import * as studion from '@studion/infra-code-blocks';

const dashboard = new studion.grafana.dashboard.DashboardBuilder('service-logs')
  .withTitle('Service Logs')
  .addVariable(
    studion.grafana.variables.searchQuery.createSearchVariable({
      description: 'Search log messages',
    }),
  )
  .addVariable(studion.grafana.variables.limit.createLimitVariable())
  .addPanel(
    studion.grafana.panels.createTablePanel(
      'Recent Logs',
      { x: 0, y: 0, w: 24, h: 12 },
      'logs-datasource',
      [
        {
          expression: 'fields @timestamp, @message | limit $limit',
          queryMode: 'Logs',
        },
      ],
    ),
  )
  .build();

export const dashboardFactory = dashboard;
```

### Non-trivial scenario

```ts
import * as studion from '@studion/infra-code-blocks';

const environmentVariable =
  studion.grafana.variables.helpers.createCustomCSVVariable(
    'environment',
    'Environment',
    ['dev', 'staging', 'prod'],
    'prod',
    {
      description: 'Environment filter used by dashboard queries',
    },
  );

const severityVariable =
  studion.grafana.variables.logLevel.createLogLevelVariable({
    description: 'Filter logs by severity',
  });

const dashboard = new studion.grafana.dashboard.DashboardBuilder('ops-logs')
  .withTitle('Operations Logs')
  .addVariable(environmentVariable)
  .addVariable(severityVariable)
  .addPanel(
    studion.grafana.panels.createTablePanel(
      'Filtered Logs',
      { x: 0, y: 0, w: 24, h: 12 },
      'logs-datasource',
      [
        {
          expression:
            "fields @timestamp, @message | filter environment = '$environment' | filter level =~ /$log_level/ | limit 50",
          queryMode: 'Logs',
        },
      ],
    ),
  )
  .build();

export const dashboardFactory = dashboard;
```

## Implementation notes

- Variable helpers return plain JSON-ready objects; they do not create Pulumi or Grafana resources by themselves.
- `DashboardBuilder.addVariable()` appends variables to `templating.list` in the generated dashboard JSON.
- `helpers.createCustomJSONVariable()` serializes `values` with `JSON.stringify(values)` and stores `valuesFormat: 'json'`.
- `helpers.createCustomCSVVariable()` joins `values` with commas and stores `valuesFormat: 'csv'`.
- `limit.createLimitVariable()` defaults to `[20, 50, 100, 250, 500, 1000]` and selects `20` by default.
- `logLevel.createLogLevelVariable()` defaults to `ALL`, `Trace`, `Debug`, `Info`, `Warn`, `Error`, and `Fatal`, with `ALL` selected by default.
- The public search textbox helper is exported as `grafana.variables.searchQuery.createSearchVariable()` and creates a variable named `search` with label `Search`.
- `trace-id` variable support is currently internal to the logs/traces dashboard because `createTraceIdVariable()` is not exported from `grafana.variables`.

## API Reference

### `grafana.variables.types`

**Exported Members**

| Member               | Kind | Description                                                                 |
| -------------------- | ---- | --------------------------------------------------------------------------- |
| `Variable`           | type | Union of supported Grafana dashboard variable shapes.                       |
| `VariableOptions`    | type | Optional shared metadata applied to helper-created variables.               |
| `BaseVariable`       | type | Shared `name`, `label`, and option fields used by concrete variable shapes. |
| `TextBoxVariable`    | type | Textbox variable shape.                                                     |
| `CustomJSONVariable` | type | Custom variable shape backed by JSON-serialized values.                     |
| `CustomCSVVariable`  | type | Custom variable shape backed by comma-separated values.                     |
| `JSONVariable`       | type | Text/value pair used by JSON custom variables.                              |
| `CSVVariable`        | type | Primitive value supported by CSV custom variables.                          |

**Supporting Types**

**`Variable`**

```ts
type Variable = TextBoxVariable | CustomJSONVariable | CustomCSVVariable;
```

**`VariableOptions`**

```ts
type VariableOptions = {
  description?: string;
  hide?: string;
};
```

| Property                   | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `description`<br/>`string` | Optional help text shown by Grafana for the variable.  |
| `hide`<br/>`string`        | Grafana hide mode passed through to the variable JSON. |

**`BaseVariable`**

```ts
type BaseVariable = {
  name: string;
  label: string;
} & VariableOptions;
```

| Property               | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `name`\*<br/>`string`  | Variable identifier referenced in queries.          |
| `label`\*<br/>`string` | Human-readable variable label displayed by Grafana. |

**`TextBoxVariable`**

```ts
type TextBoxVariable = BaseVariable & {
  type: 'textbox';
};
```

| Property                 | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `type`\*<br/>`'textbox'` | Grafana textbox variable type discriminator. Default: `'textbox'`. |

**`CustomJSONVariable`**

```ts
type CustomJSONVariable = BaseVariable & {
  type: 'custom';
  query: string;
  current: JSONVariable;
  valuesFormat: 'json';
};
```

| Property                       | Description                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `type`\*<br/>`'custom'`        | Grafana custom variable type discriminator. Default: `'custom'`.               |
| `query`\*<br/>`string`         | JSON string containing available values.                                       |
| `current`\*<br/>`JSONVariable` | Currently selected text/value pair.                                            |
| `valuesFormat`\*<br/>`'json'`  | Marker used by this package to identify JSON-backed values. Default: `'json'`. |

**`CustomCSVVariable`**

```ts
type CustomCSVVariable = BaseVariable & {
  type: 'custom';
  query: string;
  current: CSVVariable;
  valuesFormat: 'csv';
};
```

| Property                      | Description                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `type`\*<br/>`'custom'`       | Grafana custom variable type discriminator. Default: `'custom'`.             |
| `query`\*<br/>`string`        | Comma-separated string containing available values.                          |
| `current`\*<br/>`CSVVariable` | Currently selected primitive value.                                          |
| `valuesFormat`\*<br/>`'csv'`  | Marker used by this package to identify CSV-backed values. Default: `'csv'`. |

**`JSONVariable`**

```ts
type JSONVariable = {
  text: string;
  value: string;
};
```

| Property               | Description                         |
| ---------------------- | ----------------------------------- |
| `text`\*<br/>`string`  | Display text shown in the dropdown. |
| `value`\*<br/>`string` | Query value used when selected.     |

**`CSVVariable`**

```ts
type CSVVariable = string | number;
```

| Property                         | Description                                   |
| -------------------------------- | --------------------------------------------- |
| `value`\*<br/>`string \| number` | Primitive value used in CSV custom variables. |

### `grafana.variables.helpers`

**Signatures**

```ts
function createCustomJSONVariable(
  name: string,
  label: string,
  values: JSONVariable[],
  current: JSONVariable,
  options: VariableOptions,
): CustomJSONVariable;
function createCustomCSVVariable(
  name: string,
  label: string,
  values: CSVVariable[],
  current: CSVVariable,
  options: VariableOptions,
): CustomCSVVariable;
function createTextBoxVariable(
  name: string,
  label: string,
  options: VariableOptions,
): TextBoxVariable;
```

**Configuration Options**

| Parameter                         | Description                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `name`\*<br/>`string`             | Variable identifier referenced in dashboard queries. Used by: All helper functions.             |
| `label`\*<br/>`string`            | Human-readable label displayed by Grafana. Used by: All helper functions.                       |
| `values`\*<br/>`JSONVariable[]`   | Available values serialized with `JSON.stringify(values)`. Used by: `createCustomJSONVariable`. |
| `values`\*<br/>`CSVVariable[]`    | Available values joined with commas. Used by: `createCustomCSVVariable`.                        |
| `current`\*<br/>`JSONVariable`    | Current JSON text/value pair. Used by: `createCustomJSONVariable`.                              |
| `current`\*<br/>`CSVVariable`     | Current CSV primitive value. Used by: `createCustomCSVVariable`.                                |
| `options`\*<br/>`VariableOptions` | Optional metadata object spread into the returned variable. Used by: All helper functions.      |

**Return Value**

| Function                   | Return type          | Description                         |
| -------------------------- | -------------------- | ----------------------------------- |
| `createCustomJSONVariable` | `CustomJSONVariable` | JSON-backed custom variable object. |
| `createCustomCSVVariable`  | `CustomCSVVariable`  | CSV-backed custom variable object.  |
| `createTextBoxVariable`    | `TextBoxVariable`    | Textbox variable object.            |

### `grafana.variables.limit.createLimitVariable`

**Signature**

```ts
function createLimitVariable(
  options?: VariableOptions,
  limits?: number[],
): CustomCSVVariable;
```

**Configuration Options**

| Parameter                       | Description                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `options`<br/>`VariableOptions` | Optional metadata object spread into the variable. Default: `{}`.                              |
| `limits`<br/>`number[]`         | Available limit values; the first value is selected. Default: `[20, 50, 100, 250, 500, 1000]`. |

**Return Value**

| Return type         | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `CustomCSVVariable` | Custom CSV variable named `limit` with label `Limit`. |

### `grafana.variables.logLevel.createLogLevelVariable`

**Signature**

```ts
function createLogLevelVariable(options?: VariableOptions): CustomJSONVariable;
```

**Configuration Options**

| Parameter                       | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `options`<br/>`VariableOptions` | Optional metadata object spread into the variable. Default: `{}`. |

**Return Value**

| Return type          | Description                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `CustomJSONVariable` | Custom JSON variable named `log_level` with label `Log Level`; default selection is `ALL`. |

**Supporting Types**

**Default log-level values**

```ts
const LOG_LEVELS = [
  { text: 'ALL', value: '/./' },
  { text: 'Trace', value: "'trace'" },
  { text: 'Debug', value: "'debug'" },
  { text: 'Info', value: "'info'" },
  { text: 'Warn', value: "'warn'" },
  { text: 'Error', value: "'error'" },
  { text: 'Fatal', value: "'fatal'" },
];
```

| Property               | Description                             |
| ---------------------- | --------------------------------------- |
| `text`\*<br/>`string`  | Display text shown in the variable UI.  |
| `value`\*<br/>`string` | Value inserted into logs query filters. |

### `grafana.variables.searchQuery.createSearchVariable`

**Signature**

```ts
function createSearchVariable(options?: VariableOptions): TextBoxVariable;
```

**Configuration Options**

| Parameter                       | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `options`<br/>`VariableOptions` | Optional metadata object spread into the variable. Default: `{}`. |

**Return Value**

| Return type       | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `TextBoxVariable` | Textbox variable named `search` with label `Search`. |
