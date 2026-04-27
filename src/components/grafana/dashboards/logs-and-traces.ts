import { mergeWithDefaults } from '../../../shared/merge-with-defaults';
import { GrafanaDashboardBuilder } from './builder';
import { createLimitVariable } from '../variables/limit';
import { createLogLevelVariable } from '../variables/log-level';
import { createSearchQueryVariable } from '../variables/search-query';
import { createTraceIdVariable } from '../variables/trace-id';
import {
  createLogsViewPanel,
  createTracesViewPanel,
} from '../panels/logs-traces';

export namespace LogsAndTracesDashboard {
  export type Args = {
    name: string;
    title: string;
    logsDataSourceName: string;
    logGroupName: string;
    tracesDataSourceName: string;
    dashboardConfig?: GrafanaDashboardBuilder.Config;
  };
}

const defaults = {
  title: 'Logs & Traces',
  dashboardConfig: {
    refresh: '1m',
  },
};

export function createLogsAndTracesDashboard(
  config: LogsAndTracesDashboard.Args,
): GrafanaDashboardBuilder.CreateDashboard {
  const argsWithDefaults = mergeWithDefaults(defaults, config);
  const { title, logsDataSourceName, logGroupName, tracesDataSourceName } =
    argsWithDefaults;

  return new GrafanaDashboardBuilder(config.name)
    .withConfig(argsWithDefaults.dashboardConfig)
    .withTitle(title)
    .addVariable(createSearchQueryVariable())
    .addVariable(createLogLevelVariable())
    .addVariable(createLimitVariable())
    .addVariable(createTraceIdVariable())
    .addPanel(
      createLogsViewPanel({
        logGroupName,
        logsDataSourceName,
        tracesDataSourceName,
      }),
    )
    .addPanel(
      createTracesViewPanel({
        dataSourceName: tracesDataSourceName,
      }),
    )
    .build();
}
