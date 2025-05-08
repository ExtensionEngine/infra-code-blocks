import { MonitoringDashboard } from './types';

const percentageFieldConfig = {
  unit: 'percent',
  min: 0,
  max: 100
}

export function createStatPercentagePanel(
  title: string,
  position: MonitoringDashboard.Panel.Position,
  dataSource: string,
  metric: MonitoringDashboard.Metric
): MonitoringDashboard.Panel {
  return {
    title,
    gridPos: position,
    type: 'stat',
    datasource: dataSource,
    targets: [{
      expr: metric.query,
      legendFormat: metric.label
    }],
    fieldConfig: {
      defaults: {
        ...percentageFieldConfig,
        ...(metric.thresholds ? {
          thresholds: {
            mode: 'absolute',
            steps: metric.thresholds
          }
        } : {})
      }
    }
  };
}

export function createTimeSeriesPercentagePanel(
  title: string,
  position: MonitoringDashboard.Panel.Position,
  dataSource: string,
  metric: MonitoringDashboard.Metric
): MonitoringDashboard.Panel {
  return createTimeSeriesPanel(
    title,
    position,
    dataSource,
    metric,
    percentageFieldConfig.unit,
    percentageFieldConfig.min,
    percentageFieldConfig.max
  );
}

export function createTimeSeriesPanel(
  title: string,
  position: MonitoringDashboard.Panel.Position,
  dataSource: string,
  metric: MonitoringDashboard.Metric,
  unit?: string,
  min?: number,
  max?: number
): MonitoringDashboard.Panel {
  return {
    title,
    type: 'timeseries',
    datasource: dataSource,
    gridPos: position,
    targets: [{
      expr: metric.query,
      legendFormat: metric.label
    }],
    fieldConfig: {
      defaults: {
        unit,
        min,
        max,
        ...(metric.thresholds ? {
          thresholds: {
            mode: 'absolute',
            steps: metric.thresholds
          }
        } : {}),
      }
    }
  };
}
