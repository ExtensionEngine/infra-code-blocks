export interface ConfigContext<T extends Record<string, any>> {
  config: T;
}

export interface AwsContext<U extends Record<string, any>> {
  clients: U;
}

export interface PulumiProgramContext<S extends Record<string, any>> {
  outputs?: S;
}
