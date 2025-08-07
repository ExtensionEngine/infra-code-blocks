import { Grafana } from './types';

const percentageFieldConfig = {
  unit: 'percent',
  min: 0,
  max: 100,
};

export function createStatPercentagePanel(
  title: string,
  position: Grafana.Panel.Position,
  dataSource: string,
  metric: Grafana.Metric,
): Grafana.Panel {
  return {
    title,
    gridPos: position,
    type: 'stat',
    datasource: dataSource,
    targets: [
      {
        expr: metric.query,
        legendFormat: metric.label,
      },
    ],
    fieldConfig: {
      defaults: {
        ...percentageFieldConfig,
        ...(metric.thresholds
          ? {
              thresholds: {
                mode: 'absolute',
                steps: metric.thresholds,
              },
            }
          : {}),
      },
    },
  };
}

export function createTimeSeriesPercentagePanel(
  title: string,
  position: Grafana.Panel.Position,
  dataSource: string,
  metric: Grafana.Metric,
): Grafana.Panel {
  return createTimeSeriesPanel(
    title,
    position,
    dataSource,
    metric,
    percentageFieldConfig.unit,
    percentageFieldConfig.min,
    percentageFieldConfig.max,
  );
}

export function createTimeSeriesPanel(
  title: string,
  position: Grafana.Panel.Position,
  dataSource: string,
  metric: Grafana.Metric,
  unit?: string,
  min?: number,
  max?: number,
): Grafana.Panel {
  return {
    title,
    type: 'timeseries',
    datasource: dataSource,
    gridPos: position,
    targets: [
      {
        expr: metric.query,
        legendFormat: metric.label,
      },
    ],
    fieldConfig: {
      defaults: {
        unit,
        min,
        max,
        ...(metric.thresholds
          ? {
              thresholds: {
                mode: 'absolute',
                steps: metric.thresholds,
              },
            }
          : {}),
      },
    },
  };
}

export function createBurnRatePanel(
  title: string,
  position: Grafana.Panel.Position,
  dataSource: string,
  metric: Grafana.Metric,
): Grafana.Panel {
  return {
    type: 'stat',
    title,
    gridPos: position,
    datasource: dataSource,
    targets: [
      {
        expr: metric.query,
        legendFormat: metric.label,
      },
    ],
    options: {
      reduceOptions: {
        calcs: ['last'],
        fields: '',
        values: false,
      },
      colorMode: 'value',
      graphMode: 'none',
      textMode: 'value',
    },
    fieldConfig: {
      defaults: {
        unit: 'none',
        thresholds: {
          mode: 'absolute',
          steps: [
            { color: 'green', value: null },
            { color: 'orange', value: 1 },
            { color: 'red', value: 2 },
          ],
        },
      },
    },
  };
}
