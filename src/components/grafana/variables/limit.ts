import { createCustomCSVVariable } from './helpers';
import { VariableOptions } from './types';

const DEFAULT_LIMITS = [20, 50, 100, 250, 500, 1000];

export function createLimitVariable(
  options: VariableOptions = {},
  limits = DEFAULT_LIMITS,
) {
  return createCustomCSVVariable('limit', 'Limit', limits, limits[0], options);
}
