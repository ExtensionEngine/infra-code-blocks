export type CacheRuleTtl = number | keyof typeof PredefinedTtl;

export function parseCacheRuleTtl(ttl: CacheRuleTtl): number | undefined {
  if (typeof ttl === 'string') {
    return PredefinedTtl[ttl];
  }

  return ttl;
}

const PredefinedTtl = {
  default: undefined,
  off: 0,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
} as const;
