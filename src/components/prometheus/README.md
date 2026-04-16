# `src/components/prometheus`

`prometheus.queries` provides PromQL string builders for HTTP availability, success rate, latency, and burn-rate calculations over the package's standard request duration metrics.

Use these helpers to keep dashboard, alert, and SLO queries consistent while passing namespace, time range, and label filters explicitly.

## Usage examples

### Happy path

```ts
import * as studion from '@studion/infra-code-blocks';

const availability = studion.prometheus.queries.getAvailabilityPercentageQuery(
  'api',
  '5m',
);
```

### Non-trivial scenario

```ts
import * as studion from '@studion/infra-code-blocks';

const successRate = studion.prometheus.queries.getSuccessRateQuery(
  'api',
  '10m',
  'http_route=~"/api/.*"',
);

const burnRate = studion.prometheus.queries.getBurnRateQuery(
  successRate,
  0.999,
);
```

## Implementation notes

- All helpers return plain `string` values and do not validate metric existence, label correctness, PromQL syntax, or time-range syntax at runtime.
- Metric names are assembled as `${namespace}_http_server_duration_milliseconds_<postfix>`; the namespace is interpolated verbatim and the postfix is selected internally as `_count` or `_bucket` depending on the helper.
- `getAvailabilityQuery()` has no caller-provided filter and treats every non-`5xx` response as successful by applying `http_status_code!~"5.."` to the count metric.
- `getSuccessRateQuery()` treats `2xx`, `3xx`, and `4xx` responses as successful by applying `http_status_code=~"[2-4].."` and joining that selector with the required caller-supplied filter.
- `getPercentileLatencyQuery()` requires a caller-supplied filter and uses `histogram_quantile(percentile, sum by(le) (rate(...)))` over the bucket metric.
- `getLatencyRateQuery()` uses the `threshold` argument as an exact Prometheus bucket boundary selector: `le="<threshold>"`.
- Percentage helpers do not change the underlying selection logic; they append ` * 100` to their ratio query.
- `getBurnRateQuery()` is metric-agnostic; it wraps the caller-provided query as `(1 - metricQuery) / (1 - target)`, with the denominator formatted by `toFixed(5)`.
- Filters are interpolated verbatim into label selectors, so callers are responsible for providing valid PromQL label syntax.
- `TimeRange` is a TypeScript template-literal type only. It supports numeric seconds (`'90'`, `'1.5'`), single-unit durations using `ms`, `s`, `m`, `h`, `d`, `w`, or `y` (`'30s'`, `'5m'`, `'1h'`), and two-part combined durations (`'1h30m'`, `'1w2d'`) at compile time.
- `getLatencyRateQuery()` and `getLatencyPercentageQuery()` accept `filter?`; omit it for namespace-wide latency queries or provide a Prometheus label selector fragment when route or label level scoping is required.

## API Reference

### `prometheus`

**Exported Members**

| Member    | Kind      | Description                                                                                     |
| --------- | --------- | ----------------------------------------------------------------------------------------------- |
| `queries` | namespace | PromQL string-builder namespace for availability, success-rate, latency, and burn-rate queries. |

### `prometheus.queries`

**Signatures**

```ts
function getBurnRateQuery(metricQuery: string, target: number): string;
function getAvailabilityQuery(namespace: string, timeRange: TimeRange): string;
function getAvailabilityPercentageQuery(
  namespace: string,
  timeRange: TimeRange,
): string;
function getSuccessRateQuery(
  namespace: string,
  timeRange: TimeRange,
  filter: string,
): string;
function getSuccessPercentageQuery(
  namespace: string,
  timeRange: TimeRange,
  filter: string,
): string;
function getPercentileLatencyQuery(
  namespace: string,
  timeRange: TimeRange,
  percentile: number,
  filter: string,
): string;
function getLatencyRateQuery(
  namespace: string,
  timeRange: TimeRange,
  threshold: number,
  filter?: string,
): string;
function getLatencyPercentageQuery(
  namespace: string,
  timeRange: TimeRange,
  threshold: number,
  filter?: string,
): string;
```

**Configuration Options**

| Parameter                     | Description                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metricQuery`\*<br/>`string`  | Caller-supplied ratio query wrapped into an error-budget burn-rate formula. Used by: `getBurnRateQuery`.                                                                                                                                                                                              |
| `target`\*<br/>`number`       | SLO target ratio used in `(1 - metricQuery) / (1 - target)`. Used by: `getBurnRateQuery`.                                                                                                                                                                                                             |
| `namespace`\*<br/>`string`    | Metric namespace prefix interpolated into `${namespace}_http_server_duration_milliseconds_<postfix>`. Used by: All query builders except `getBurnRateQuery`.                                                                                                                                          |
| `timeRange`\*<br/>`TimeRange` | PromQL range selector used inside `rate(...[timeRange])`. Used by: All query builders except `getBurnRateQuery`.                                                                                                                                                                                      |
| `filter`<br/>`string`         | Label selector fragment interpolated directly into the metric selector. Required: Yes for success and percentile helpers; optional for latency helpers. Used by: `getSuccessRateQuery`, `getSuccessPercentageQuery`, `getPercentileLatencyQuery`, `getLatencyRateQuery`, `getLatencyPercentageQuery`. |
| `percentile`\*<br/>`number`   | Quantile passed to `histogram_quantile(percentile, ...)`. Used by: `getPercentileLatencyQuery`.                                                                                                                                                                                                       |
| `threshold`\*<br/>`number`    | Exact Prometheus histogram bucket boundary selector used as `le="<threshold>"`. Used by: `getLatencyRateQuery`, `getLatencyPercentageQuery`.                                                                                                                                                          |

**Supporting Types**

**`TimeRange`**

```ts
type TimeRange = `${number}` | UnitDuration | `${UnitDuration}${UnitDuration}`;
```

`TimeRange` is a compile-time template-literal type. It supports numeric seconds such as `'90'` or `'1.5'`, single-unit durations such as `'30s'`, `'5m'`, and `'1h'`, plus two-part combined durations such as `'1h30m'` and `'1w2d'`.

**Return Values**

| Export                           | Return type | Description                                                                |
| -------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `getBurnRateQuery`               | `string`    | Error-budget burn-rate formula derived from a caller-supplied metric query |
| `getAvailabilityQuery`           | `string`    | Ratio of non-`5xx` request rate to total request rate                      |
| `getAvailabilityPercentageQuery` | `string`    | Availability ratio multiplied by `100`                                     |
| `getSuccessRateQuery`            | `string`    | Ratio of filtered `2xx`-`4xx` request rate to filtered total request rate  |
| `getSuccessPercentageQuery`      | `string`    | Success ratio multiplied by `100`                                          |
| `getPercentileLatencyQuery`      | `string`    | `histogram_quantile(...)` query over bucket rates                          |
| `getLatencyRateQuery`            | `string`    | Ratio of bucket rate under `le="threshold"` to total request rate          |
| `getLatencyPercentageQuery`      | `string`    | Latency ratio multiplied by `100`                                          |
