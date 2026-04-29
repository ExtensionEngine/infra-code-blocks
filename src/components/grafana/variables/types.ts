export type JSONVariable = {
  text: string;
  value: string;
};

export type CSVVariable = string | number;

export type VariableOptions = {
  description?: string;
  hide?: string;
};

export type BaseVariable = {
  name: string;
  label: string;
} & VariableOptions;

export type TextBoxVariable = BaseVariable & {
  type: 'textbox';
};

export type CustomJSONVariable = BaseVariable & {
  type: 'custom';
  query: string;
  current: JSONVariable;
  valuesFormat: 'json';
};

export type CustomCSVVariable = BaseVariable & {
  type: 'custom';
  query: string;
  current: CSVVariable;
  valuesFormat: 'csv';
};

export type Variable = TextBoxVariable | CustomJSONVariable | CustomCSVVariable;
