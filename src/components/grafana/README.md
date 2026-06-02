# `src/components/grafana`

The `grafana` namespace provisions Grafana Cloud/OSS resources for AWS-backed observability: access policies, rotating tokens, plugins, folders, data sources, dashboards, dashboard panels, and dashboard variables.

Use `GrafanaBuilder` to declare Grafana plugins at the top-level Grafana layer, assemble AMP, CloudWatch Logs, X-Ray, SLO dashboards, logs/traces dashboards, and custom dashboard integrations, without hand-authoring the underlying Grafana provider resources.

## Usage examples

### Happy path

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const workspace = new aws.amp.Workspace('api-metrics', {});

const grafana = new studion.grafana.GrafanaBuilder('service-observability')
  .withStackSlug('exampleslug')
  .withFolderName('Service Observability')
  .addPlugin({
    name: 'amp',
    slug: 'grafana-amazonprometheus-datasource',
  })
  .addAmp('metrics', {
    awsAccountId: '123456789012',
    endpoint: workspace.prometheusEndpoint,
  })
  .addSloDashboard({
    name: 'api-slo',
    title: 'API SLO',
    ampNamespace: 'api',
    filter: 'route="/api"',
    dataSourceName: 'metrics-datasource',
  })
  .build();

export const folderUid = grafana.folder.uid;
export const dashboardUids = grafana.dashboards.map(dashboard => dashboard.uid);
```

### Non-trivial scenario

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const workspace = new aws.amp.Workspace('platform-metrics', {});

const overviewDashboard = new studion.grafana.dashboard.DashboardBuilder(
  'platform-overview',
)
  .withTitle('Platform Overview')
  .withConfig({
    timezone: 'utc',
    refresh: '30s',
  })
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

const stackSlug = studion.grafana.Grafana.getStackSlug(
  'https://example.grafana.net',
);

const grafana = new studion.grafana.GrafanaBuilder('platform-observability')
  .withStackSlug(stackSlug)
  .withFolderName('Platform Observability')
  .withServiceAccountTokenRotation({
    secondsToLive: 86_400,
    earlyRotationWindowSeconds: 3_600,
  })
  .withAccessPolicyTokenRotation({
    expireAfter: '48h',
    earlyRotationWindow: '2h',
  })
  .addScope('alerts:read')
  .addPlugin({
    name: 'amp',
    slug: 'grafana-amazonprometheus-datasource',
  })
  .addPlugin({
    name: 'xray',
    slug: 'grafana-x-ray-datasource',
  })
  .addAmp('metrics', {
    awsAccountId: '123456789012',
    endpoint: workspace.prometheusEndpoint,
  })
  .addCloudWatchLogs('logs', {
    awsAccountId: '123456789012',
  })
  .addXRay('traces', {
    awsAccountId: '123456789012',
  })
  .addLogsAndTracesDashboard({
    name: 'platform-logs-traces',
    title: 'Platform Logs & Traces',
    logsDataSourceName: 'logs-datasource',
    logGroupName: '/aws/ecs/platform-api',
    tracesDataSourceName: 'traces-datasource',
  })
  .addDashboard(overviewDashboard)
  .build();

export const dataSourceNames = grafana.connections.map(
  connection => connection.dataSource.name,
);
```

## Implementation notes

- `Grafana` requires `stackSlug` as explicit constructor input and uses it to resolve the Grafana Cloud stack metadata.
- Use `Grafana.getStackSlug(grafanaUrl)` when you have a Grafana Cloud URL and need to derive the stack slug from the first hostname label, for example `https://<stack>.grafana.net` -> `<stack>`.
- Creating the initial Grafana Cloud resources still requires a Grafana Cloud access policy token supplied through the Grafana provider configuration, typically `grafana:cloudAccessPolicyToken` or `GRAFANA_CLOUD_ACCESS_POLICY_TOKEN`. Required scopes: `accesspolicies:read`, `accesspolicies:write`, `accesspolicies:delete`, `stacks:read`, `stack-service-accounts:write`.
- The access policy created by this component always includes these package-required scopes: `accesspolicies:read`, `accesspolicies:write`, `accesspolicies:delete`, `datasources:read`, `datasources:write`, `datasources:delete`, `stacks:read`, `stack-dashboards:read`, `stack-dashboards:write`, `stack-dashboards:delete`, `stack-plugins:read`, `stack-plugins:write`, and `stack-plugins:delete`.
- User-provided `scopes` are merged with the required scopes using `Set`, so duplicate scope strings are removed before the access policy is created.
- The component creates an access-policy rotating token first, then a stack service account with `Admin` role, then a service-account rotating token, and finally a Grafana provider that uses both generated tokens.
- Plugins declared on `Grafana.Args.plugins` or added through `GrafanaBuilder.addPlugin()` are installed by the top-level `Grafana` component before dependent resources are created.
- Plugins added with `addPlugin()` are accumulated in insertion order and forwarded to `Grafana.Args.plugins` during `build()`.
- Each declared plugin creates a `grafana.cloud.PluginInstallation` resource exposed through `Grafana.plugins` plus an internal `PluginReady` resource that polls the resolved stack URL until the plugin is available.
- Connections are created after the internal `PluginReady` checks, so plugin-backed data sources such as AMP and X-Ray assume plugin availability from the surrounding `Grafana` setup or from externally preinstalled plugins.
- The rotating tokens default to 90-day lifetimes with a 7-day early rotation window and `deleteOnDestroy: true`.
- If `folderName` is omitted, dashboards are placed in a folder named `${name}-ICB-GENERATED`.
- `GrafanaBuilder.build()` throws unless you set a stack slug and add at least one connection and at least one dashboard.
- Connection-specific behavior and data-source details are documented in [`connections`](connections/README.md).
- Dashboard builder constraints, variables, and generated dashboard layouts are documented in [`dashboards`](dashboards/README.md).
- Panel helper defaults, thresholds, table/traces primitives, and grid positions are documented in [`panels`](panels/README.md).
- Dashboard variable helpers are documented in [`variables`](variables/README.md).

## API Reference

### `grafana.Grafana`

**Signature**

```ts
class Grafana extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: Grafana.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                                   |
| -------------------------------------------- | ------------------------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name used as the resource name base. |
| `args`\*<br/>`Grafana.Args`                  | Component configuration expanded below.                       |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi resource options for the component.           |

**Configuration Options**

Direct constructor input: `args: Grafana.Args`

| Property                                                                | Description                                                                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `stackSlug`\*<br/>`string`                                              | Grafana Cloud stack slug used to resolve stack metadata, configure the generated provider, and run plugin readiness checks. |
| `connectionBuilders`\*<br/>`GrafanaConnection.CreateConnection[]`       | Factories invoked with `{ stack }` and provider-scoped `opts` to create connection components.                              |
| `dashboardBuilders`\*<br/>`DashboardBuilder.CreateDashboard[]`          | Factories invoked with the generated folder and provider-scoped `opts` to create dashboards.                                |
| `folderName`<br/>`string`                                               | Title for the generated Grafana folder. Default: `<name>-ICB-GENERATED`.                                                    |
| `scopes`<br/>`string[]`                                                 | Extra access-policy scopes merged with the module's required defaults. Default: `[]`.                                       |
| `plugins`<br/>`Grafana.PluginArgs[]`                                    | Plugins to install and wait for before creating dependent Grafana resources. Default: `[]`.                                 |
| `serviceAccountTokenRotation`<br/>`Grafana.ServiceAccountTokenRotation` | Rotation settings for the service-account token. Default: `{ secondsToLive: 7776000, earlyRotationWindowSeconds: 604800 }`. |
| `accessPolicyTokenRotation`<br/>`Grafana.AccessPolicyTokenRotation`     | Rotation settings for the access-policy token. Default: `{ expireAfter: '2160h', earlyRotationWindow: '168h' }`.            |

**Outputs**

| Property                                                                   | Description                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`<br/>`string`                                                        | Component name.                                                                                                                                                                                                   |
| `stack`<br/>`pulumi.Output<grafana.cloud.GetStackResult>`                  | Resolved Grafana Cloud stack metadata.                                                                                                                                                                            |
| `accessPolicy`<br/>`grafana.cloud.AccessPolicy`                            | Access policy created for data source and dashboard provisioning.                                                                                                                                                 |
| `accessPolicyToken`<br/>`grafana.cloud.AccessPolicyRotatingToken`          | Rotating token for the generated access policy.                                                                                                                                                                   |
| `serviceAccount`<br/>`grafana.cloud.StackServiceAccount`                   | Service account used by the Grafana provider.                                                                                                                                                                     |
| `serviceAccountToken`<br/>`grafana.cloud.StackServiceAccountRotatingToken` | Rotating token for the generated service account.                                                                                                                                                                 |
| `provider`<br/>`grafana.Provider`                                          | Grafana provider configured with the resolved stack URL and auth token.                                                                                                                                           |
| `plugins`<br/>`grafana.cloud.PluginInstallation[] \| undefined`            | Grafana Cloud plugin installation resources created for declared plugins. Use this when you need to reference the installation resources directly; readiness polling is handled internally through `PluginReady`. |
| `folder`<br/>`grafana.oss.Folder`                                          | Folder created for all dashboards built by the component.                                                                                                                                                         |
| `dashboards`<br/>`grafana.oss.Dashboard[]`                                 | Dashboards created from `dashboardBuilders`, in insertion order.                                                                                                                                                  |

**Supporting Types**

**`Grafana.PluginArgs`**

```ts
type PluginArgs = {
  name: string;
  slug: string;
  version?: string;
};
```

| Property               | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `name`\*<br/>`string`  | Friendly logical name used for the plugin resource naming.         |
| `slug`\*<br/>`string`  | Grafana plugin identifier passed to the plugin installation.       |
| `version`<br/>`string` | Optional plugin version; omit it to use the provider default flow. |

**`Grafana.ServiceAccountTokenRotation`**

```ts
type ServiceAccountTokenRotation = {
  secondsToLive: number;
  earlyRotationWindowSeconds: number;
};
```

| Property                                    | Description                                    |
| ------------------------------------------- | ---------------------------------------------- |
| `secondsToLive`\*<br/>`number`              | Token lifetime in seconds.                     |
| `earlyRotationWindowSeconds`\*<br/>`number` | Seconds before expiry when rotation can begin. |

**`Grafana.AccessPolicyTokenRotation`**

```ts
type AccessPolicyTokenRotation = {
  expireAfter: string;
  earlyRotationWindow: string;
};
```

| Property                             | Description                                            |
| ------------------------------------ | ------------------------------------------------------ |
| `expireAfter`\*<br/>`string`         | Token lifetime string passed to the Grafana provider.  |
| `earlyRotationWindow`\*<br/>`string` | Rotation window string passed to the Grafana provider. |

**Helper Methods**

**`Grafana.getStackSlug`**

```ts
Grafana.getStackSlug(grafanaUrl: string): string
```

Parses a Grafana Cloud URL and returns the first hostname label to use as `Grafana.Args.stackSlug`.

### `grafana.GrafanaBuilder`

**Signature**

```ts
class GrafanaBuilder {
  constructor(name: string);
}
```

**Constructor Parameters**

| Property              | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `name`\*<br/>`string` | Builder/component base name used when `build()` constructs `Grafana`. |

**Builder Methods**

| Method                            | Parameters                                                         | Description                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `withStackSlug`                   | `stackSlug: string`                                                | Sets the required `Grafana.Args.stackSlug`; must be called before `build()`.                                                 |
| `withFolderName`                  | `folderName: string`                                               | Sets `Grafana.Args.folderName`.                                                                                              |
| `withServiceAccountTokenRotation` | `rotation: Grafana.ServiceAccountTokenRotation`                    | Sets `Grafana.Args.serviceAccountTokenRotation`.                                                                             |
| `withAccessPolicyTokenRotation`   | `rotation: Grafana.AccessPolicyTokenRotation`                      | Sets `Grafana.Args.accessPolicyTokenRotation`.                                                                               |
| `addScope`                        | `...scopes: string[]`                                              | Appends scopes that will later be merged into `Grafana.Args.scopes`.                                                         |
| `addPlugin`                       | `plugin: Grafana.PluginArgs`                                       | Declares a Grafana plugin to install before building plugin-backed data sources and dashboards.                              |
| `addAmp`                          | `name: string, args: Omit<AMPConnection.Args, 'stack'>`            | Appends an AMP connection factory. See [`connections`](connections/README.md).                                               |
| `addCloudWatchLogs`               | `name: string, args: Omit<CloudWatchLogsConnection.Args, 'stack'>` | Appends a CloudWatch Logs connection factory. See [`connections`](connections/README.md).                                    |
| `addXRay`                         | `name: string, args: Omit<XRayConnection.Args, 'stack'>`           | Appends an X-Ray connection factory. See [`connections`](connections/README.md).                                             |
| `addConnection`                   | `builder: GrafanaConnection.CreateConnection`                      | Appends a custom connection factory. See [`connections`](connections/README.md).                                             |
| `addSloDashboard`                 | `config: SloDashboard.Args`                                        | Appends `createSloDashboard(config)`. See [`dashboards`](dashboards/README.md).                                              |
| `addLogsAndTracesDashboard`       | `config: LogsAndTracesDashboard.Args`                              | Appends `createLogsAndTracesDashboard(config)`. See [`dashboards`](dashboards/README.md).                                    |
| `addDashboard`                    | `dashboard: DashboardBuilder.CreateDashboard`                      | Appends a custom dashboard factory. See [`dashboards`](dashboards/README.md).                                                |
| `build`                           | `opts?: pulumi.ComponentResourceOptions`                           | Constructs `Grafana` from the accumulated values. Throws if no stack slug, no connections, or no dashboards have been added. |

**Build Result**

```ts
build(opts?: pulumi.ComponentResourceOptions): Grafana
```

| Return type | Description                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `Grafana`   | Aggregate component that provisions the Grafana provider, plugin readiness, folder, connections, and dashboards. |

**Supporting Types**

**`GrafanaConnection.CreateConnection`**

```ts
type CreateConnection = (
  ctx: GrafanaConnection.CreateConnectionContext,
  opts: pulumi.ComponentResourceOptions,
) => GrafanaConnection;
```

Custom connection factories are documented in [`connections`](connections/README.md).

**`DashboardBuilder.CreateDashboard`**

```ts
type CreateDashboard = (
  folder?: grafana.oss.Folder,
  opts?: pulumi.ComponentResourceOptions,
) => grafana.oss.Dashboard;
```

Custom dashboard factories are documented in [`dashboards`](dashboards/README.md).

### `grafana.GrafanaConnection`

Abstract base class for connection components that provision data source and IAM resources. Plugin-backed connections such as AMP and X-Ray rely on plugin availability managed by the surrounding `Grafana` component or external Grafana administration. See [`connections`](connections/README.md) for constructor args, factory types, and outputs.

### `grafana.AMPConnection`

Built-in AMP connection component for the `grafana-amazonprometheus-datasource` data source type. See [`connections`](connections/README.md#-grafanaampconnection) for configuration and outputs.

### `grafana.CloudWatchLogsConnection`

Built-in CloudWatch Logs connection component for the `cloudwatch` data source type. See [`connections`](connections/README.md#-grafanacloudwatchlogsconnection) for configuration and outputs.

### `grafana.XRayConnection`

Built-in X-Ray connection component for the `grafana-x-ray-datasource` data source type. See [`connections`](connections/README.md#-grafanaxrayconnection) for configuration and outputs.

### `grafana.dashboard`

**Exported Members**

| Member                         | Kind     | Description                                                                                 |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `DashboardBuilder`             | class    | Fluent dashboard builder that returns `DashboardBuilder.CreateDashboard` factories.         |
| `createSloDashboard`           | function | Factory helper for the package-standard nine-panel SLO dashboard layout.                    |
| `createLogsAndTracesDashboard` | function | Factory helper for the package-standard logs and traces dashboard with dashboard variables. |

See [`dashboards`](dashboards/README.md) for full builder methods, supporting types, and return-value details.

### `grafana.panels`

**Exported Members**

| Member                                  | Kind      | Description                                                                                        |
| --------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `Panel`, `Panel.Position`               | types     | JSON-ready panel shapes accepted by `DashboardBuilder.addPanel()`.                                 |
| `Metric`, `Threshold`                   | types     | Shared query metadata and threshold-step types used by panel helpers.                              |
| `Target`, `Override`, `Transformation`  | types     | Flexible target, field override, and transformation shapes used by table and traces panels.        |
| Generic, table, traces, and SLO helpers | functions | Helpers that return JSON-ready panel objects for custom dashboards and built-in dashboard layouts. |

See [`panels`](panels/README.md) for helper signatures, parameter groups, and return values.

### `grafana.variables`

**Exported Members**

| Member        | Kind      | Description                                                                |
| ------------- | --------- | -------------------------------------------------------------------------- |
| `helpers`     | namespace | Generic custom JSON, custom CSV, and textbox variable factory helpers.     |
| `limit`       | namespace | Built-in `limit` variable helper used by logs/traces dashboards.           |
| `logLevel`    | namespace | Built-in log-level variable helper used by logs/traces dashboards.         |
| `searchQuery` | namespace | Built-in search textbox variable helper used by logs/traces dashboards.    |
| `types`       | namespace | Shared dashboard variable type definitions accepted by `DashboardBuilder`. |

See [`variables`](variables/README.md) for variable helper signatures, supported types and defaults.
