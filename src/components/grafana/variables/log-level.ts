import { createCustomJSONVariable } from './helpers';
import { VariableOptions } from './types';

const LOG_LEVELS = [
  { text: 'ALL', value: '/./' },
  { text: 'Trace', value: "'trace'" },
  { text: 'Debug', value: "'debug'" },
  { text: 'Info', value: "'info'" },
  { text: 'Warn', value: "'warn'" },
  { text: 'Error', value: "'error'" },
  { text: 'Fatal', value: "'fatal'" },
];

export function createLogLevelVariable(options: VariableOptions = {}) {
  return createCustomJSONVariable(
    'log_level',
    'Log Level',
    LOG_LEVELS,
    LOG_LEVELS[0],
    options,
  );
}
