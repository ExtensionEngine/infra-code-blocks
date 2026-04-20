export type VariableOption = {
  text: string;
  value: string | number;
};

export type CustomVariable = {
  type: 'custom';
  name: string;
  label: string;
  query: string;
  current: VariableOption;
  valuesFormat: 'json';
};

export type TextBoxVariable = {
  type: 'textbox';
  name: string;
  label: string;
  hide?: string;
};

export type Variable = CustomVariable | TextBoxVariable;

export type BuildQuery = (options: VariableOption[]) => string;
