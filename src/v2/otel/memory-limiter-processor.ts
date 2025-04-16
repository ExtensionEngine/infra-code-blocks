export namespace MemoryLimiterProcessor {
  export type Config = {
    check_interval: string;
    limit_percentage: number;
    spike_limit_percentage: number;
  };
}

export const defaults = {
  checkInterval: '1s',
  limitPercentage: 80,
  spikeLimitPercentage: 15
};
