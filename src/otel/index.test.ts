import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as pulumi from '@pulumi/pulumi';
import * as yaml from 'yaml';
import { OtelCollector } from './index';

const shellSensitiveConfig: OtelCollector.Config = {
  receivers: {
    otlp: {
      protocols: {
        http: {
          endpoint: "0.0.0.0:4318; echo 'broken' && $HOME `whoami`",
        },
      },
    },
  },
  processors: {},
  exporters: {
    debug: {
      verbosity: "it's detailed\n$(touch /tmp/pwned) `uname`; & | > <",
    },
  },
  extensions: {},
  service: {
    pipelines: {},
    telemetry: {
      logs: {
        level: "warn: '$HOME'\nnext line",
      },
    },
  },
};

describe('OtelCollector', () => {
  it('should write collector config through a base64-decoded payload', async () => {
    const collector = new OtelCollector(
      'service-name',
      'test',
      shellSensitiveConfig,
    );
    const commandInput = collector.configContainer.command;

    assert.ok(commandInput);

    const command = await resolveCommand(commandInput);
    const [, , script] = command;
    const encodedConfig = Buffer.from(
      yaml.stringify(shellSensitiveConfig),
      'utf8',
    ).toString('base64');

    assert.deepEqual(command.slice(0, 2), ['sh', '-c']);
    assert.match(script, /base64 -d/);
    assert.match(script, /mktemp \/etc\/otelcol-contrib\/config\.yaml\.XXXXXX/);
    assert.match(
      script,
      /mv "\$tmp_config" \/etc\/otelcol-contrib\/config\.yaml/,
    );
    assert.match(script, new RegExp(encodedConfig));
    assert.doesNotMatch(script, /echo '/);
    assert.doesNotMatch(script, /touch \/tmp\/pwned/);
    assert.doesNotMatch(script, /whoami/);
  });
});

async function resolveCommand(
  input: pulumi.Input<pulumi.Input<string>[]>,
): Promise<string[]> {
  return new Promise<string[]>(resolve => {
    pulumi.output(input).apply(command => {
      resolve(command);

      return command;
    });
  });
}
