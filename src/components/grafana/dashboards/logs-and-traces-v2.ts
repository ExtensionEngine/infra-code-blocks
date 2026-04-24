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
  createLogsViewPanelV2,
  createTracesViewPanel,
} from '../panels/logs-traces';

export namespace LogsAndTracesDashboardV2 {
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

export function createLogsAndTracesDashboardV2(
  config: LogsAndTracesDashboardV2.Args,
): GrafanaDashboardBuilder.CreateDashboard {
  const argsWithDefaults = mergeWithDefaults(defaults, config);
  const { title, logsDataSourceName, logGroupName, tracesDataSourceName } =
    argsWithDefaults;

  return new GrafanaDashboardBuilder(config.name)
    .withConfig(argsWithDefaults.dashboardConfig)
    .withTitle(title)
    .addVariable(createSearchMessage())
    .addVariable(createSearchHttpUrl())
    .addVariable(createLogLevelVariable())
    .addVariable(createStatusCodeVariable())
    .addVariable(createHttpMethodVariable())
    .addVariable(createLimitVariable())
    .addVariable(createTraceIdVariable())
    .addPanel(
      createLogsViewPanelV2({
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
