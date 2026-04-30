import { createTextBoxVariable } from './helpers';
import { VariableOptions } from './types';

export function createSearchVariable(options: VariableOptions = {}) {
  return createTextBoxVariable('search', 'Search', options);
}
