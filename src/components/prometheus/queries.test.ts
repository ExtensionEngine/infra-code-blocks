import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  getAvailabilityQuery,
  getSuccessRateQuery,
  getPercentileLatencyQuery,
  getLatencyPercentageQuery,
  TimeRange,
} from './queries';

describe('Prometheus Query Builders', async () => {
  const namespace = 'app';
  const timeRange: TimeRange = '2m';
  const apiRouteFilter = 'http_route=~"/api/.*"';

  describe('getAvailabilityQuery', async () => {
    it('should build correct query', () => {
      const result = getAvailabilityQuery(namespace, timeRange);
      const expected =
        `(sum(rate(${namespace}_http_server_duration_milliseconds_count{http_status_code!~"5.."}[${timeRange}]))) / ` +
        `(sum(rate(${namespace}_http_server_duration_milliseconds_count[${timeRange}]))) * 100`;
      assert.equal(result, expected);
    });
  });

  describe('getSuccessRateQuery', async () => {
    it('should build correct query', () => {
      const result = getSuccessRateQuery(namespace, timeRange, apiRouteFilter);
      const expected =
        `(sum(rate(${namespace}_http_server_duration_milliseconds_count{http_status_code=~"[2-4]..",${apiRouteFilter}}[2m]))) / ` +
        `(sum(rate(${namespace}_http_server_duration_milliseconds_count{${apiRouteFilter}}[2m]))) * 100`;
      assert.equal(result, expected);
    });
  });

  describe('getPercentileLatencyQuery', async () => {
    it('should build correct query', () => {
      const percentile = 0.95;
      const result = getPercentileLatencyQuery(
        namespace,
        timeRange,
        percentile,
        apiRouteFilter,
      );
      const expected = `histogram_quantile(${percentile}, sum by(le) (rate(${namespace}_http_server_duration_milliseconds_bucket{${apiRouteFilter}}[${timeRange}])))`;
      assert.equal(result, expected);
    });
  });

  describe('getLatencyPercentageQuery', async () => {
    it('should build correct query', () => {
      const threshold = 200;
      const result = getLatencyPercentageQuery(
        namespace,
        timeRange,
        threshold,
        apiRouteFilter,
      );
      const expected =
        `(sum(rate(${namespace}_http_server_duration_milliseconds_bucket{le="200",${apiRouteFilter}}[2m]))) / ` +
        `(sum(rate(${namespace}_http_server_duration_milliseconds_count{${apiRouteFilter}}[2m]))) * 100`;
      assert.equal(result, expected);
    });
  });
});
