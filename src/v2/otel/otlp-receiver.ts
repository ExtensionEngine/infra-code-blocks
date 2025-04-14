export namespace OTLPReceiver {
  export type Protocol = 'http' | 'grpc';
  export type Config = {
    protocols: {
      [K in Protocol]?: {
        endpoint: string;
      };
    };
  };
}

export const Protocol = {
  grpc: {
    endpoint: '0.0.0.0:4317'
  },
  http: {
    endpoint: '0.0.0.0:4318'
  }
};

