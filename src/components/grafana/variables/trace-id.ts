import { createTextBoxVariable } from './helpers';

export function createTraceIdVariable() {
  return createTextBoxVariable('traceId', 'Trace Id', 'hideVariable');
}
