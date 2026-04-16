export type VariableOption = {
  text: string;
  value: string;
};

export type Variable = {
  type: string;
  name: string;
  label: string;
  query: string;
  current: VariableOption;
  valuesFormat: string;
};

export type BuildQuery = (options: VariableOption[]) => string;
