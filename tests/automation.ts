import {
  DestroyResult,
  LocalProgramArgs,
  LocalWorkspace,
  OutputMap
} from '@pulumi/pulumi/automation';
import { createSpinner } from 'nanospinner';

export async function deploy(args: LocalProgramArgs): Promise<OutputMap> {
  const spinner = createSpinner('Deploying stack...').start();
  const stack = await LocalWorkspace.createOrSelectStack(args);
  await stack.setConfig('aws:region', { value: 'us-east-2' });
  const up = await stack.up({ logToStdErr: true });
  spinner.success({ text: 'Stack deployed' });

  return up.outputs;
}

export async function destroy(args: LocalProgramArgs): Promise<DestroyResult> {
  const spinner = createSpinner('Destroying stack...').start();
  const stack = await LocalWorkspace.createOrSelectStack(args);
  const result = await stack.destroy();
  spinner.success({ text: 'Stack destroyed' });

  return result;
}

export async function getOutputs(args: LocalProgramArgs): Promise<OutputMap> {
  const stack = await LocalWorkspace.createOrSelectStack(args);

  return stack.outputs();
}
