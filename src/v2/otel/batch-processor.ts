export namespace BatchProcessor {
  export type Config = {
    send_batch_size: number;
    send_batch_max_size: number;
    timeout: string;
  };
}

export const defaults = {
  size: 8192,
  maxSize: 10000,
  timeout: '5s'
};
