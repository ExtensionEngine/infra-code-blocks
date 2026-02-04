export function mergeWithDefaults<
  T extends Record<PropertyKey, unknown>,
  U extends Record<PropertyKey, unknown>,
>(defaults: T, args: U): T & U {
  const argsWithoutUndefined = Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined),
  ) as U;

  return Object.assign({}, defaults, argsWithoutUndefined);
}
