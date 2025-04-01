import { describe, it, before } from 'node:test';
import * as assert from 'node:assert';
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks({
  newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
    return {
      id: args.inputs.name + "_id",
      state: args.inputs,
    };
  },
  call: function(args: pulumi.runtime.MockCallArgs) {
    return args.inputs;
  }
});

describe('Web server component', () => {
  let infra: typeof import('./infrastructure/index');

  before(async () => (infra = await import('./infrastructure/index')));

  it('passes correct desiredCount argument', () => {
    pulumi.all([
      infra.webServer,
      infra.webServer.service.service.desiredCount
    ]).apply(([
      server,
      desiredCount
    ]) => {
      assert.strictEqual(server.name, 'web-server-example');
      assert.strictEqual(desiredCount, 1);
    });
  });
});
