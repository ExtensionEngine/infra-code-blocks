import {
  DestroyResult,
  InlineProgramArgs,
  LocalWorkspace,
  OutputMap,
} from '@pulumi/pulumi/automation';
import { createSpinner } from 'nanospinner';
import { requireEnv } from './util';

export async function deploy(
  args: InlineProgramArgs,
  region?: string,
): Promise<OutputMap> {
  const spinner = createSpinner().start('Deploying stack...');

  try {
    const stack = await LocalWorkspace.createOrSelectStack(args);

    await stack.setConfig('aws:region', {
      value: region ?? requireEnv('AWS_REGION'),
    });

    const result = await stack.up({ logToStdErr: true });

    spinner.success('Stack deployed');

    return result.outputs;
  } catch (err) {
    spinner.error('Failed to deploy stack!');

    throw err;
  }
}

export async function destroy(args: InlineProgramArgs): Promise<DestroyResult> {
  const spinner = createSpinner().start('Destroying stack...');

  try {
    const stack = await LocalWorkspace.createOrSelectStack(args);
    const result = await stack.destroy();

    spinner.success('Stack destroyed');

    return result;
  } catch (err) {
    spinner.error('Failed to destroy stack!');

    throw err;
  }
}

export async function getOutputs(args: InlineProgramArgs): Promise<OutputMap> {
  const stack = await LocalWorkspace.createOrSelectStack(args);

  return stack.outputs();
}
