import {
  CSVVariable,
  CustomCSVVariable,
  CustomJSONVariable,
  JSONVariable,
  TextBoxVariable,
  VariableOptions,
} from './types';

export function createCustomJSONVariable(
  name: string,
  label: string,
  values: JSONVariable[],
  current: JSONVariable,
  options: VariableOptions,
): CustomJSONVariable {
  return {
    type: 'custom',
    name,
    label,
    query: JSON.stringify(values),
    current: current,
    valuesFormat: 'json',
    ...options,
  };
}

export function createCustomCSVVariable(
  name: string,
  label: string,
  values: CSVVariable[],
  current: CSVVariable,
  options: VariableOptions,
): CustomCSVVariable {
  return {
    type: 'custom',
    name,
    label,
    query: values.join(','),
    current: current,
    valuesFormat: 'csv',
    ...options,
  };
}

export function createTextBoxVariable(
  name: string,
  label: string,
  options: VariableOptions,
): TextBoxVariable {
  return {
    type: 'textbox',
    name,
    label,
    ...options,
  };
}
