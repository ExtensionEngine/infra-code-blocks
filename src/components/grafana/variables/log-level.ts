import { createCustomVariable } from './helpers';

const LOG_LEVELS = [
  { text: 'trace', value: "logLevel = 'trace'" },
  { text: 'debug', value: "logLevel = 'debug'" },
  { text: 'info', value: "logLevel = 'info'" },
  { text: 'warn', value: "logLevel = 'warn'" },
  { text: 'error', value: "logLevel = 'error'" },
  { text: 'fatal', value: "logLevel = 'fatal'" },
];

export function createLogLevelVariable() {
  return createCustomVariable(
    'log_level',
    'Log Level',
    LOG_LEVELS,
    LOG_LEVELS[2],
  );
}
