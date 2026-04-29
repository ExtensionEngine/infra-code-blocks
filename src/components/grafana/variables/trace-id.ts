import { createTextBoxVariable } from './helpers';
import { VariableOptions } from './types';

export function createTraceIdVariable(options: VariableOptions = {}) {
  return createTextBoxVariable('traceId', 'Trace Id', {
    hide: 'hideVariable',
    ...options,
  });
}
