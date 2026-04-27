import { createCustomVariable } from './helpers';

const LOG_LEVELS = [
  { text: 'All', value: '/./' },
  { text: 'Trace', value: "'trace'" },
  { text: 'Debug', value: "'debug'" },
  { text: 'Info', value: "'info'" },
  { text: 'Warn', value: "'warn'" },
  { text: 'Error', value: "'error'" },
  { text: 'Fatal', value: "'fatal'" },
];

export function createLogLevelVariable() {
  return createCustomVariable(
    'log_level',
    'Log Level',
    LOG_LEVELS,
    LOG_LEVELS[0],
  );
}
