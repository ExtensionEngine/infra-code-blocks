# `src/components/grafana/connections`

The `grafana.connections` namespace provides AWS-backed Grafana data-source components and factory types consumed by `Grafana` and `GrafanaBuilder`.

Use it when Grafana should query AMP, CloudWatch Logs, X-Ray, or custom AWS observability backends through package-managed IAM roles and data sources. AMP and X-Ray create plugin-backed data source types, but plugin installation and readiness are managed by the surrounding `Grafana` / `GrafanaBuilder` configuration or by external Grafana administration.

## Usage examples

### Happy path

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const workspace = new aws.amp.Workspace('platform-metrics', {});

const overviewDashboard = new studion.grafana.dashboard.DashboardBuilder(
  'overview',
)
  .withTitle('Overview')
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

const grafana = new studion.grafana.GrafanaBuilder('platform-observability')
  .withStackSlug('exampleslug')
  .addPlugin({
    name: 'amp',
    slug: 'grafana-amazonprometheus-datasource',
  })
  .addConnection(
    // addAmp() is a convenience wrapper for the same pattern
    (ctx, opts) =>
      new studion.grafana.AMPConnection(
        'metrics',
        {
          ...ctx,
          awsAccountId: '123456789012',
          endpoint: workspace.prometheusEndpoint,
          dataSourceName: 'metrics-datasource',
        },
        opts,
      ),
  )
  .addDashboard(overviewDashboard)
  .build();

export const connectionNames = grafana.connections.map(
  connection => connection.name,
);
```

### Non-trivial scenario

```ts
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as grafana from '@pulumiverse/grafana';
import * as studion from '@studion/infra-code-blocks';

type CustomMetricsConnectionArgs = studion.grafana.GrafanaConnection.Args & {
  endpoint: pulumi.Input<string>;
  region: pulumi.Input<string>;
};

class CustomMetricsConnection extends studion.grafana.GrafanaConnection {
  public readonly dataSource: grafana.oss.DataSource;
  public readonly rolePolicy: aws.iam.RolePolicy;

  constructor(
    name: string,
    args: CustomMetricsConnectionArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('example:grafana:CustomMetricsConnection', name, args, opts);

    this.rolePolicy = new aws.iam.RolePolicy(
      `${name}-custom-metrics-policy`,
      {
        role: this.role.id,
        policy: aws.iam.getPolicyDocumentOutput({
          statements: [
            {
              effect: 'Allow',
              actions: ['aps:QueryMetrics'],
              resources: ['*'],
            },
          ],
        }).json,
      },
      { parent: this },
    );

    this.dataSource = new grafana.oss.DataSource(
      `${name}-custom-metrics-datasource`,
      {
        name: this.dataSourceName,
        type: 'prometheus',
        url: args.endpoint,
        jsonDataEncoded: pulumi.jsonStringify({
          sigV4Auth: true,
          sigV4AuthType: 'grafana_assume_role',
          sigV4Region: args.region,
          sigV4AssumeRoleArn: this.role.arn,
        }),
      },
      { parent: this },
    );

    this.registerOutputs();
  }
}

const customDashboard = new studion.grafana.dashboard.DashboardBuilder(
  'custom-metrics-overview',
)
  .withTitle('Custom Metrics Overview')
  .addPanel(
    studion.grafana.panels.createTimeSeriesPanel(
      'Custom Request Volume',
      { x: 0, y: 0, w: 12, h: 8 },
      'custom-metrics-datasource',
      {
        label: 'RPS',
        query: 'sum(rate(custom_http_requests_total[5m]))',
        thresholds: [],
      },
    ),
  )
  .build();

const tracesDashboard = new studion.grafana.dashboard.DashboardBuilder('traces')
  .withTitle('Traces')
  .addPanel(
    studion.grafana.panels.createBurnRatePanel(
      'Trace Burn Rate',
      { x: 0, y: 0, w: 8, h: 4 },
      'traces-datasource',
      {
        label: 'Burn Rate',
        query: 'sum(rate(trace_errors_total[5m]))',
        thresholds: [],
      },
    ),
  )
  .build();

const grafana = new studion.grafana.GrafanaBuilder('custom-observability')
  .withStackSlug('exampleslug')
  .addConnection(
    (ctx, opts) =>
      new CustomMetricsConnection(
        'custom-metrics',
        {
          ...ctx,
          awsAccountId: '123456789012',
          endpoint: 'https://example.com/prometheus',
          region: 'eu-west-1',
          dataSourceName: 'custom-metrics-datasource',
        },
        opts,
      ),
  )
  .addConnection(
    (ctx, opts) =>
      new studion.grafana.CloudWatchLogsConnection(
        'logs',
        {
          ...ctx,
          awsAccountId: '123456789012',
          region: 'eu-west-1',
          dataSourceName: 'logs-datasource',
        },
        opts,
      ),
  )
  .addConnection(
    (ctx, opts) =>
      new studion.grafana.XRayConnection(
        'traces',
        {
          ...ctx,
          awsAccountId: '123456789012',
          region: 'eu-west-1',
          installPlugin: false,
          dataSourceName: 'traces-datasource',
        },
        opts,
      ),
  )
  .addDashboard(customDashboard)
  .addDashboard(tracesDashboard)
  .build();

export const dataSourceTypes = grafana.connections.map(
  connection => connection.dataSource.type,
);
export const customDataSourceName = grafana.connections[0].dataSource.name;
```

## Implementation notes

- `GrafanaConnection` owns the shared IAM-role setup used by built-in and custom connection classes.
- The IAM trust policy allows `arn:aws:iam::<awsAccountId>:root` to assume the role and requires `sts:ExternalId == stack.id`.
- `GrafanaConnection` defaults `dataSourceName` to `<name>-datasource` when you do not provide one.
- Concrete connection subclasses create their own Grafana data source and any additional IAM role policies.
- `addConnection()` is the extension point for registering built-in or custom connection classes with `GrafanaBuilder`.
- `GrafanaBuilder` helpers such as `addAmp()`, `addCloudWatchLogs()`, and `addXRay()` are convenience wrappers for common built-in connection classes.
- Built-in AWS connection classes use an explicit `region` when provided and otherwise derive the region from the active AWS provider.
- AMP and X-Ray still create plugin-backed Grafana data source types, so the matching plugins must be declared on the surrounding `Grafana` / `GrafanaBuilder` or preinstalled externally.
- `AMPConnection` creates a `grafana-amazonprometheus-datasource` data source configured for SigV4 assume-role auth against the connection IAM role.
- `XRayConnection` creates a `grafana-x-ray-datasource` data source configured for assume-role auth against the connection IAM role.
- `CloudWatchLogsConnection` uses Grafana's built-in `cloudwatch` data source type, configures assume-role auth against the connection IAM role, and does not require plugin installation from this package.
- The built-in IAM role policies all use `resources: ['*']` for their respective read/query permissions.
- For plugin installation and readiness behavior, see [`grafana`](../README.md).

## API Reference

### `grafana.GrafanaConnection`

**Signature**

```ts
abstract class GrafanaConnection extends pulumi.ComponentResource {
  constructor(
    type: string,
    name: string,
    args: GrafanaConnection.Args,
    opts: pulumi.ComponentResourceOptions = {},
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                                           |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `type`\*<br/>`string`                        | Pulumi component type token used by the concrete connection subclass. |
| `name`\*<br/>`string`                        | Logical Pulumi component name used as the resource name base.         |
| `args`\*<br/>`GrafanaConnection.Args`        | Base connection configuration expanded below.                         |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi resource options for the component. Default: `{}`.    |

**Configuration Options**

Direct constructor input: `args: GrafanaConnection.Args`

| Property                                                   | Description                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `awsAccountId`\*<br/>`string`                              | AWS account ID whose root principal is allowed to assume the generated role.             |
| `dataSourceName`<br/>`string`                              | Display name used for the Grafana data source. Default: `<name>-datasource`.             |
| `stack`\*<br/>`pulumi.Input<grafana.cloud.GetStackResult>` | Grafana Cloud stack metadata used for IAM trust and supplied by the enclosing `Grafana`. |

**Outputs**

| Property                                  | Description                                             |
| ----------------------------------------- | ------------------------------------------------------- |
| `name`<br/>`string`                       | Component name.                                         |
| `role`<br/>`aws.iam.Role`                 | IAM role assumed by Grafana for AWS access.             |
| `dataSource`<br/>`grafana.oss.DataSource` | Grafana data source resource created by the connection. |

**Supporting Types**

**`GrafanaConnection.CreateConnection`**

```ts
type CreateConnection = (
  ctx: CreateConnectionContext,
  opts: pulumi.ComponentResourceOptions,
) => GrafanaConnection;
```

| Property                                                | Description                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ctx`\*<br/>`GrafanaConnection.CreateConnectionContext` | Builder context containing the resolved stack input.                    |
| `opts`\*<br/>`pulumi.ComponentResourceOptions`          | Pulumi resource options passed to the constructed connection component. |

<br />

| Return type         | Description                                 |
| ------------------- | ------------------------------------------- |
| `GrafanaConnection` | Connection component returned by a factory. |

**Notes**

- `GrafanaBuilder` `addAmp()`, `addCloudWatchLogs()`, `addXRay()`, and `addConnection()` supply `stack` for you when they create connection components.
- Plugin-backed connection types such as AMP and X-Ray still depend on top-level plugin availability.

**`GrafanaConnection.CreateConnectionContext`**

```ts
type CreateConnectionContext = Pick<Args, 'stack'>;
```

Carries the resolved stack input injected by the enclosing `Grafana` component.

### `grafana.AMPConnection`

**Signature**

```ts
class AMPConnection extends GrafanaConnection {
  constructor(
    name: string,
    args: AMPConnection.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                                   |
| -------------------------------------------- | ------------------------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name used as the resource name base. |
| `args`\*<br/>`AMPConnection.Args`            | AMP connection configuration expanded below.                  |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi resource options for the component.           |

**Configuration Options**

Direct constructor input: `args: AMPConnection.Args`

| Property                                                   | Description                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awsAccountId`\*<br/>`string`                              | AWS account ID whose root principal is allowed to assume the generated role.                                                                                |
| `dataSourceName`<br/>`string`                              | Display name used for the Grafana data source. Default: `<name>-datasource`.                                                                                |
| `stack`\*<br/>`pulumi.Input<grafana.cloud.GetStackResult>` | Grafana Cloud stack metadata used for IAM trust and supplied by the enclosing `Grafana`.                                                                    |
| `endpoint`\*<br/>`pulumi.Input<string>`                    | AMP workspace endpoint used as the data source URL.                                                                                                         |
| `region`<br/>`pulumi.Input<string>`                        | AWS region written into SigV4 data source configuration. Uses this explicit value when provided; otherwise derives the region from the active AWS provider. |

**Outputs**

| Property                                  | Description                                                      |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `name`<br/>`string`                       | Component name.                                                  |
| `role`<br/>`aws.iam.Role`                 | IAM role assumed by Grafana for AMP access.                      |
| `dataSource`<br/>`grafana.oss.DataSource` | AMP data source configured for SigV4 assume-role authentication. |
| `rolePolicy`<br/>`aws.iam.RolePolicy`     | IAM policy granting AMP query permissions.                       |

**Notes**

- AMP data sources use the `grafana-amazonprometheus-datasource` plugin-backed data source type.
- Ensure the matching plugin is declared on `Grafana.Args.plugins`, added via `GrafanaBuilder.addPlugin()`, or preinstalled externally before using this connection.

### `grafana.CloudWatchLogsConnection`

**Signature**

```ts
class CloudWatchLogsConnection extends GrafanaConnection {
  constructor(
    name: string,
    args: CloudWatchLogsConnection.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                                   |
| -------------------------------------------- | ------------------------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name used as the resource name base. |
| `args`\*<br/>`CloudWatchLogsConnection.Args` | CloudWatch Logs connection configuration expanded below.      |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi resource options for the component.           |

**Configuration Options**

Direct constructor input: `args: CloudWatchLogsConnection.Args`

| Property                                                   | Description                                                                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awsAccountId`\*<br/>`string`                              | AWS account ID whose root principal is allowed to assume the generated role.                                                                              |
| `dataSourceName`<br/>`string`                              | Display name used for the Grafana data source. Default: `<name>-datasource`.                                                                              |
| `stack`\*<br/>`pulumi.Input<grafana.cloud.GetStackResult>` | Grafana Cloud stack metadata used for IAM trust and supplied by the enclosing `Grafana`.                                                                  |
| `region`<br/>`pulumi.Input<string>`                        | AWS region written to `jsonDataEncoded.defaultRegion`. Uses this explicit value when provided; otherwise derives the region from the active AWS provider. |

**Outputs**

| Property                                  | Description                                               |
| ----------------------------------------- | --------------------------------------------------------- |
| `name`<br/>`string`                       | Component name.                                           |
| `role`<br/>`aws.iam.Role`                 | IAM role assumed by Grafana for CloudWatch Logs access.   |
| `dataSource`<br/>`grafana.oss.DataSource` | CloudWatch data source configured for assume-role access. |
| `rolePolicy`<br/>`aws.iam.RolePolicy`     | IAM policy granting CloudWatch Logs query permissions.    |

### `grafana.XRayConnection`

**Signature**

```ts
class XRayConnection extends GrafanaConnection {
  constructor(
    name: string,
    args: XRayConnection.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                                   |
| -------------------------------------------- | ------------------------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name used as the resource name base. |
| `args`\*<br/>`XRayConnection.Args`           | X-Ray connection configuration expanded below.                |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi resource options for the component.           |

**Configuration Options**

Direct constructor input: `args: XRayConnection.Args`

| Property                                                   | Description                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awsAccountId`\*<br/>`string`                              | AWS account ID whose root principal is allowed to assume the generated role.                                                                                  |
| `dataSourceName`<br/>`string`                              | Display name used for the Grafana data source. Default: `<name>-datasource`.                                                                                  |
| `stack`\*<br/>`pulumi.Input<grafana.cloud.GetStackResult>` | Grafana Cloud stack metadata used for IAM trust and supplied by the enclosing `Grafana`.                                                                      |
| `region`<br/>`pulumi.Input<string>`                        | AWS region written to the X-Ray data source configuration. Uses this explicit value when provided; otherwise derives the region from the active AWS provider. |

**Outputs**

| Property                                  | Description                                                  |
| ----------------------------------------- | ------------------------------------------------------------ |
| `name`<br/>`string`                       | Component name.                                              |
| `role`<br/>`aws.iam.Role`                 | IAM role assumed by Grafana for X-Ray access.                |
| `dataSource`<br/>`grafana.oss.DataSource` | X-Ray data source configured for assume-role authentication. |
| `rolePolicy`<br/>`aws.iam.RolePolicy`     | IAM policy granting X-Ray query permissions.                 |

**Notes**

- X-Ray data sources use the `grafana-x-ray-datasource` plugin-backed data source type.
- Ensure the matching plugin is declared on `Grafana.Args.plugins`, added via `GrafanaBuilder.addPlugin()`, or preinstalled externally before using this connection.
