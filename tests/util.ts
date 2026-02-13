import * as pulumi from '@pulumi/pulumi';
import { OutputMap } from '@pulumi/pulumi/automation';
import * as studion from '@studion/infra-code-blocks';
import { backOff as backOffFn, BackoffOptions } from 'exponential-backoff';

const backOffDefaults: BackoffOptions = {
  delayFirstAttempt: true,
  numOfAttempts: 5,
  startingDelay: 1500,
  timeMultiple: 2,
  jitter: 'full',
};

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Environment variable ${name} is required.`);
  }

  return value;
}

export function backOff<T>(
  request: () => Promise<T>,
  opts: BackoffOptions = {},
): Promise<T> {
  return backOffFn(request, { ...backOffDefaults, ...opts });
}

export function unwrapOutputs<T extends Record<string, any>>(
  outputMap: OutputMap,
): T {
  const unwrapped = {} as T;

  for (const [key, outputValue] of Object.entries(outputMap) as [
    keyof T,
    T[keyof T],
  ][]) {
    unwrapped[key] = outputValue.value;
  }

  return unwrapped;
}

export function getCommonVpc(): pulumi.Output<studion.Vpc> {
  const ref = requireEnv('ICB_COMMON_INFRA_STACK_REF');
  const stack = new pulumi.StackReference(ref);
  const vpc = stack.getOutput('vpc');

  return vpc as pulumi.Output<studion.Vpc>;
}
