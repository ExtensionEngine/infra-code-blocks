import * as pulumi from '@pulumi/pulumi';

export namespace PrometheusRemoteWriteExporter {
  export type Config = {
    namespace: pulumi.Input<string>;
    endpoint: pulumi.Input<string>;
    auth?: {
      authenticator: pulumi.Input<string>;
    };
  };
}
