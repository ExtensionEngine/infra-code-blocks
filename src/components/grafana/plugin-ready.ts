import * as pulumi from '@pulumi/pulumi';
import { backOff } from 'exponential-backoff';
import { request } from 'undici';

export namespace PluginReady {
  export type Args = {
    grafanaToken: pulumi.Output<string>;
    grafanaUrl: pulumi.Input<string>;
    slug: pulumi.Input<string>;
  };
}

export class PluginReady extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    props: PluginReady.Args,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(new PluginReadyProvider(), name, props, opts);
  }
}

type PluginReadyProviderInputs = {
  grafanaToken: string;
  grafanaUrl: string;
  slug: string;
};

class PluginReadyProvider implements pulumi.dynamic.ResourceProvider {
  async create(
    inputs: PluginReadyProviderInputs,
  ): Promise<pulumi.dynamic.CreateResult> {
    const { grafanaToken, grafanaUrl, slug } = inputs;

    const url = new URL(`/api/plugins/${slug}/settings`, grafanaUrl).href;

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
      throw new Error(`Timed out waiting for plugin "${slug}" to become ready`);
    }

    return { id: data.id, outs: {} };
  }
}
