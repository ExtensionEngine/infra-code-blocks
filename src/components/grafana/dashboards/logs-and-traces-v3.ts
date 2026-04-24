import { mergeWithDefaults } from '../../../shared/merge-with-defaults';
import { GrafanaDashboardBuilder } from './builder';
import { createStatusCodeVariable } from '../variables/status-code';
import { createLimitVariable } from '../variables/limit';
import { createLogLevelVariable } from '../variables/log-level';
import {
  createSearchTextVariable,
  createSearchHttpUrl,
  createSearchMessage,
} from '../variables/search-text';
import { createTraceIdVariable } from '../variables/trace-id';
import { createHttpMethodVariable } from '../variables/http-method';
import {
  createLogsViewPanel,
  createLogsViewPanelV3,
  createTracesViewPanel,
} from '../panels/logs-traces';

export namespace LogsAndTracesDashboardV3 {
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

export function createLogsAndTracesDashboardV3(
  config: LogsAndTracesDashboardV3.Args,
): GrafanaDashboardBuilder.CreateDashboard {
  const argsWithDefaults = mergeWithDefaults(defaults, config);
  const { title, logsDataSourceName, logGroupName, tracesDataSourceName } =
    argsWithDefaults;

  return new GrafanaDashboardBuilder(config.name)
    .withConfig(argsWithDefaults.dashboardConfig)
    .withTitle(title)
    .addVariable(createSearchTextVariable())
    .addVariable(createLogLevelVariable())
    .addVariable(createLimitVariable())
    .addVariable(createTraceIdVariable())
    .addPanel(
      createLogsViewPanelV3({
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
