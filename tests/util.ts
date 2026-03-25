import * as pulumi from '@pulumi/pulumi';
import { OutputMap } from '@pulumi/pulumi/automation';
import * as studion from '@studion/infra-code-blocks';
import { backOff as backOffFn, BackoffOptions } from 'exponential-backoff';

// This config results in the max wait time of ~10 minutes
const backOffDefaults: BackoffOptions = {
  delayFirstAttempt: true,
  numOfAttempts: 16,
  startingDelay: 500,
  maxDelay: 60000,
  timeMultiple: 2,
  jitter: 'none', // Drop jitter to eliminate flaky tests
  retry: err => !(err instanceof NonRetryableError),
};

export class NonRetryableError extends Error {
  constructor(message: string, options?: { cause: Error }) {
    super(message, options);

    this.name = 'NonRetryableError';
  }
}

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
