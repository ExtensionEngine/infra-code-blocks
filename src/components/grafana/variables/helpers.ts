import {
  BuildQuery,
  CustomVariable,
  VariableOption,
  TextBoxVariable,
} from './types';

const buildQuery: BuildQuery = options => JSON.stringify(options);

export function createCustomVariable(
  name: string,
  label: string,
  options: VariableOption[],
  currentOption: VariableOption,
): CustomVariable {
  return {
    type: 'custom',
    name,
    label,
    query: buildQuery(options),
    current: currentOption,
    valuesFormat: 'json',
  };
}

export function createTextBoxVariable(
  name: string,
  label: string,
  hide?: string,
): TextBoxVariable {
  return {
    type: 'textbox',
    name,
    label,
    hide,
  };
}
