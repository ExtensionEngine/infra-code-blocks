import { mergeWithDefaults } from '../../../shared/merge-with-defaults';
import { GrafanaDashboardBuilder } from './builder';
import { createStatusCodeVariable } from '../variables/status-code';
import { createLogLevelVariable } from '../variables/log-level';
import { createLogsListWithFiltersPanel } from '../panels/logs';

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
  dashboardConfig: {},
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
    .withVariable(createStatusCodeVariable())
    .withVariable(createLogLevelVariable())
    .addPanel(
      createLogsListWithFiltersPanel({
        logGroupName,
        dataSourceName: logsDataSourceName,
      }),
    )
    .build();
}
