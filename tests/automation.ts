import {
  LocalProgramArgs,
  LocalWorkspace,
  OutputMap
} from '@pulumi/pulumi/automation';

export async function deploy(args: LocalProgramArgs): Promise<OutputMap> {
  const stack = await LocalWorkspace.createOrSelectStack(args);
  await stack.setConfig('aws:region', { value: 'us-east-2' });
  const up = await stack.up({
    onOutput: console.info,
    logToStdErr: true
  });

  return up.outputs;
}

export async function destroy(args: LocalProgramArgs) {
  const stack = await LocalWorkspace.createOrSelectStack(args);

  return stack.destroy({ onOutput: console.info });
}

export async function getOutputs(args: LocalProgramArgs): Promise<OutputMap> {
  const stack = await LocalWorkspace.createOrSelectStack(args);

  return stack.outputs();
}
