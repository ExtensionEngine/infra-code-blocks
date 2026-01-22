import * as fs from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import * as pulumi from '@pulumi/pulumi';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import * as automation from './automation';

const stackName = 'dev';
const projectName = 'icb-test-common-infra';
const programArgs: InlineProgramArgs = {
  stackName,
  projectName,
  program: provisionCommonInfra,
};

async function provisionCommonInfra() {
  const { next: studion } = await import('@studion/infra-code-blocks');
  const vpc = new studion.Vpc('common-infra-vpc', {});
  const org = pulumi.getOrganization();

  process.env.ICB_COMMON_INFRA_STACK_REF = `${org}/${projectName}/${stackName}`;

  return { vpc };
}

async function globalSetup() {
  await automation.deploy(programArgs);
}

async function globalTeardown() {
  await automation.destroy(programArgs);
}

async function runTests(files?: string[]) {
  const stream = run({
    concurrency: true,
    ...(files
      ? { files }
      : {
          globPatterns: ['tests/**/index.test.ts'],
        }),
  })
    .on('test:fail', () => {
      process.exitCode = 1;
    })
    .compose(spec);

  // Do not wait for completion on stdout pipe, as it will not settle
  // as expected which in turn will cause finally to not be reached.
  // In other words, avoid:
  // `const stream = run(...).compose(...).pipe(process.stdout); await finished(stream);`
  stream.pipe(process.stdout);

  await finished(stream);
}

function getBooleanArg(name: string): boolean {
  const args = process.argv.slice(2);
  const key = `--${name}`;
  const idx = args.indexOf(key);

  return idx !== -1;
}

function getFiles(): string[] | undefined {
  const args = process.argv.slice(2);

  return args.filter(arg => arg.startsWith('tests/'));
}

(async function exec() {
  const skipSetup = getBooleanArg('skip-setup');
  const skipTests = getBooleanArg('skip-tests');
  const skipTeardown = getBooleanArg('skip-teardown');
  const createStackRefFile = getBooleanArg('stack-ref-file');
  const files = getFiles();

  try {
    if (!skipSetup) {
      console.log('Running global setup...');
      await globalSetup();
    }

    if (createStackRefFile) {
      console.log(`Writing stack ref file at: ${process.cwd()}`);
      await fs.writeFile(
        '.icbstackref',
        process.env.ICB_COMMON_INFRA_STACK_REF!,
        'utf8',
      );
    }

    if (!skipTests) {
      console.log('Running tests...');
      await runTests(files);
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (!skipTeardown) {
      console.log('Running global teardown...');
      await globalTeardown();
    }
  }
})();
