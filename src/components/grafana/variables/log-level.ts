import { Variable } from './types';
import { createCustomVariable } from './helpers';

export function createLogLevelVariable(): Variable {
  return createCustomVariable('log_level', 'Log Level', [
    { text: 'info', value: "logLevel = 'info'" },
    { text: 'trace', value: "logLevel = 'trace'" },
    { text: 'debug', value: "logLevel = 'debug'" },
    { text: 'warn', value: "logLevel = 'warn'" },
    { text: 'error', value: "logLevel = 'error'" },
    { text: 'fatal', value: "logLevel = 'fatal'" },
  ]);
}
