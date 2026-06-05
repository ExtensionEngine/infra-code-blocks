type UnknownRecord = Record<PropertyKey, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function mergeObjects(
  defaults: UnknownRecord,
  args: UnknownRecord,
): UnknownRecord {
  const result: UnknownRecord = { ...defaults };

  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) {
      continue;
    }

    const defaultValue = defaults[key];

    result[key] =
      isPlainObject(defaultValue) && isPlainObject(value)
        ? mergeObjects(defaultValue, value)
        : value;
  }

  return result;
}

/**
 * Merges `args` into `defaults`, recursively merging plain-object values.
 *
 * `undefined` values in `args` are ignored, including inside nested objects.
 * Arrays, `null`, and non-plain objects are treated as replacement values and
 * are not recursively merged.
 *
 * @example
 * const merged = mergeWithDefaults(
 *   { timeout: 3000, retry: { count: 3, delay: 500 } },
 *   { retry: { count: 5 } },
 * );
 *
 * console.log(merged);
 * // { timeout: 3000, retry: { count: 5, delay: 500 } }
 */
export function mergeWithDefaults<
  T extends UnknownRecord,
  U extends UnknownRecord,
>(defaults: T, args: U): T & U {
  return mergeObjects(defaults, args) as T & U;
}
