import * as pulumi from '@pulumi/pulumi';
import { request } from 'undici';

type PluginReadyInputs = {
  grafanaToken: pulumi.Input<string>;
  pluginSlug: string;
};

const pluginReadyProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: PluginReadyInputs) {
    const { grafanaToken, pluginSlug } = inputs;

    const grafanaConfig = new pulumi.Config('grafana');
    const grafanaUrl = grafanaConfig.get('url') ?? process.env.GRAFANA_URL;

    if (!grafanaUrl) {
      throw new Error(
        'Grafana URL is not configured. Set it via Pulumi config (grafana:url) or GRAFANA_URL env var.',
      );
    }

    const url = `${grafanaUrl.replace(/\/$/, '')}/api/plugins/${pluginSlug}/settings`;

    for (let attempt = 0; attempt < 60; attempt++) {
      const { statusCode, body } = await request(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${grafanaToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (statusCode === 200) {
        const data = (await body.json()) as { id: string };
        return { id: data.id, outs: {} };
      }

      if (statusCode !== 404) {
        throw new Error('Unexpected error');
      }

      await new Promise(r => setTimeout(r, 5000));
    }

    throw new Error('Timed out');
  },
};

export class PluginReady extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    props: PluginReadyInputs,
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(pluginReadyProvider, name, props, opts);
  }
}
