import * as pulumi from '@pulumi/pulumi';
import { backOff } from 'exponential-backoff';
import { request } from 'undici';

export namespace PluginReady {
  export type Args = {
    grafanaToken: pulumi.Input<string>;
    grafanaUrl: string;
    pluginSlug: string;
  };
}

const pluginReadyProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: PluginReady.Args) {
    const { grafanaToken, grafanaUrl, pluginSlug } = inputs;

    const url = new URL(`/api/plugins/${pluginSlug}/settings`, grafanaUrl).href;

    let data: { id: string };
    try {
      data = await backOff(
        async () => {
          const { statusCode, body } = await request(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${grafanaToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (statusCode === 200) {
            return (await body.json()) as { id: string };
          }

          if (statusCode !== 404) {
            throw new Error(`Unexpected status code: ${statusCode}`);
          }

          throw new Error('Plugin not ready yet');
        },
        {
          delayFirstAttempt: true,
          numOfAttempts: 11,
          startingDelay: 500,
          maxDelay: 60000,
          timeMultiple: 2,
          jitter: 'none',
          retry: (err: Error) => err.message === 'Plugin not ready yet',
        },
      );
    } catch {
      throw new Error(
        `Timed out waiting for plugin "${pluginSlug}" to become ready`,
      );
    }

    return { id: data.id, outs: {} };
  },
};

export class PluginReady extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    props: PluginReady.Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(pluginReadyProvider, name, props, opts);
  }
}
