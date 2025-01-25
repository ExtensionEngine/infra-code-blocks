import {
  DestroyResult,
  LocalProgramArgs,
  LocalWorkspace,
  OutputMap
} from '@pulumi/pulumi/automation';

export async function deploy(args: LocalProgramArgs): Promise<OutputMap> {
  const stack = await LocalWorkspace.createOrSelectStack(args);
  await stack.setConfig('aws:region', { value: 'us-east-2' });
  const up = await stack.up({ logToStdErr: true });

  console.info('Deploying stack...');
  return up.outputs;
}

export async function destroy(args: LocalProgramArgs): Promise<DestroyResult> {
  const stack = await LocalWorkspace.createOrSelectStack(args);
  console.log('Destroying stack...');
  return stack.destroy();
}

export async function getOutputs(args: LocalProgramArgs): Promise<OutputMap> {
  const stack = await LocalWorkspace.createOrSelectStack(args);

  return stack.outputs();
}
