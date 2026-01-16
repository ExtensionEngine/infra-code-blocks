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
  const spinner = createSpinner('Deploying stack...').start();
  const stack = await LocalWorkspace.createOrSelectStack(args);
  await stack.setConfig('aws:region', {
    value: region ?? requireEnv('AWS_REGION'),
  });
  const up = await stack.up({ logToStdErr: true });
  spinner.success({ text: 'Stack deployed' });

  return up.outputs;
}

export async function destroy(args: InlineProgramArgs): Promise<DestroyResult> {
  const spinner = createSpinner('Destroying stack...').start();
  const stack = await LocalWorkspace.createOrSelectStack(args);
  const result = await stack.destroy();
  spinner.success({ text: 'Stack destroyed' });

  return result;
}

export async function getOutputs(args: InlineProgramArgs): Promise<OutputMap> {
  const stack = await LocalWorkspace.createOrSelectStack(args);

  return stack.outputs();
}
