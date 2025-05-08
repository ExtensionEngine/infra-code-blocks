export type TimeRange = '30s' | '2m' | '5m' | '1h' | '1d';

const metricName = 'http_server_duration_milliseconds';
const countPostfix = 'count';
const bucketPostfix = 'bucket';
const httpStatusCodeLabel = 'http_status_code';

export function getAvailabilityQuery(
  namespace: string,
  timeRange: TimeRange
): string {
  const successFilter = `${httpStatusCodeLabel}!~"5.."`;
  const successfulRequestsQuery = getCountRate(
    namespace,
    timeRange,
    successFilter
  );
  const totalRequestsQuery = getCountRate(
    namespace,
    timeRange
  );

  return `(${successfulRequestsQuery}) / (${totalRequestsQuery}) * 100`;
}

export function getSuccessRateQuery(
  namespace: string,
  timeRange: TimeRange,
  filter: string
): string {
  const successFilter = [`${httpStatusCodeLabel}=~"[2-4].."`, filter].join(',');
  const totalFilter = filter;

  const successfulRequestsQuery = getCountRate(
    namespace,
    timeRange,
    successFilter
  );
  const totalRequestsQuery = getCountRate(
    namespace,
    timeRange,
    totalFilter
  );

  return `(${successfulRequestsQuery}) / (${totalRequestsQuery}) * 100`;
}

export function getPercentileLatencyQuery(
  namespace: string,
  timeRange: TimeRange,
  percentile: number,
  filter: string
): string {
  const bucketMetric = getMetric(namespace, bucketPostfix, filter);
  const bucketRate = `sum by(le) (rate(${bucketMetric}[${timeRange}]))`;

  return `histogram_quantile(${percentile}, ${bucketRate})`;
}

export function getLatencyPercentageQuery(
  namespace: string,
  timeRange: TimeRange,
  threshold: number,
  filter?: string
): string {
  const filterWithThreshold = [`le="${threshold}"`, filter].join(',');

  const requestsUnderThreshold = getBucketRate(
    namespace,
    timeRange,
    filterWithThreshold
  );
  const totalRequests = getCountRate(namespace, timeRange, filter);

  return `(${requestsUnderThreshold}) / (${totalRequests}) * 100`;
}

function getCountRate(
  namespace: string,
  timeRange: TimeRange,
  filter?: string
): string {
  const countMetric = getMetric(namespace, countPostfix, filter);

  return `sum(rate(${countMetric}[${timeRange}]))`;
}

function getBucketRate(
  namespace: string,
  timeRange: TimeRange,
  filter?: string
): string {
  const bucketMetric = getMetric(namespace, bucketPostfix, filter);

  return `sum(rate(${bucketMetric}[${timeRange}]))`;
}

function getMetric(
  namespace: string,
  postfix: string,
  filter?: string
): string {
  return `${namespace}_${metricName}_${postfix}${filter ? `{${filter}}` : ''}`;
}
