import * as os from 'node:os';
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
    // Tests are not CPU intensive, instead most of the time is spent waiting
    // for resources provisioning and destroying, so bumping concurrency over
    // recommendation improves utilization and reduces execution time.
    concurrency: os.availableParallelism() * 2,
    ...(files && files.length
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

function getFileArgs(): string[] {
  const args = process.argv.slice(2);

  return args.filter(arg => arg.startsWith('tests/'));
}

(async function exec() {
  const includeSetup = getBooleanArg('setup');
  const includeTests = getBooleanArg('tests');
  const includeTeardown = getBooleanArg('teardown');
  // Implicitly excluding everything has a same effect as explicitly including everything
  const includeAll = !includeSetup && !includeTests && !includeTeardown;
  const files = getFileArgs();

  try {
    if (includeSetup || includeAll) {
      console.log('Running global setup...');
      await globalSetup();
    }

    if (includeTests || includeAll) {
      console.log('Running tests...');
      await runTests(files);
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (includeTeardown || includeAll) {
      console.log('Running global teardown...');
      await globalTeardown();
    }
  }
})();
