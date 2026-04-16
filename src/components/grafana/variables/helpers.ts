import { BuildQuery, Variable, VariableOption } from './types';

const buildQuery: BuildQuery = options => JSON.stringify(options);

export function createCustomVariable(
  name: string,
  label: string,
  options: VariableOption[],
): Variable {
  return {
    type: 'custom',
    name,
    label,
    query: buildQuery(options),
    current: options[0],
    valuesFormat: 'json',
  };
}
