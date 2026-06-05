import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { mergeWithDefaults } from './merge-with-defaults';

describe('mergeWithDefaults', () => {
  it('should preserve flat merge behavior and ignore top-level undefined values', () => {
    const result = mergeWithDefaults(
      { hostname: 'localhost', port: 80 },
      { port: undefined, protocol: 'https' },
    );

    assert.deepEqual(result, {
      hostname: 'localhost',
      port: 80,
      protocol: 'https',
    });
  });

  it('should deeply merge nested plain objects', () => {
    const result = mergeWithDefaults(
      {
        image: 'api:latest',
        autoscaling: {
          enabled: false,
          minCount: 1,
          maxCount: 1,
        },
      },
      {
        autoscaling: {
          enabled: true,
        },
      },
    );

    assert.deepEqual(result, {
      image: 'api:latest',
      autoscaling: {
        enabled: true,
        minCount: 1,
        maxCount: 1,
      },
    });
  });

  it('should ignore undefined values in nested objects', () => {
    const result = mergeWithDefaults(
      {
        nested: {
          enabled: false,
          count: 1,
        },
      },
      {
        nested: {
          enabled: undefined,
          count: 2,
        },
      },
    );

    assert.deepEqual(result, {
      nested: {
        enabled: false,
        count: 2,
      },
    });
  });

  it('should replace arrays instead of concatenating them', () => {
    const result = mergeWithDefaults(
      {
        environment: ['DEFAULT_ENV'],
        nested: {
          secrets: ['DEFAULT_SECRET'],
        },
      },
      {
        environment: ['CUSTOM_ENV'],
        nested: {
          secrets: ['CUSTOM_SECRET'],
        },
      },
    );

    assert.deepEqual(result, {
      environment: ['CUSTOM_ENV'],
      nested: {
        secrets: ['CUSTOM_SECRET'],
      },
    });
  });

  it('should treat null as an explicit override', () => {
    const result = mergeWithDefaults(
      {
        nested: {
          value: 'default',
        } as { value: string } | null,
      },
      {
        nested: null,
      },
    );

    assert.deepEqual(result, {
      nested: null,
    });
  });

  it('should treat non-plain objects as atomic replacement values', () => {
    class Config {
      constructor(readonly value: string) {}
    }

    const defaultConfig = new Config('default');
    const customConfig = new Config('custom');

    const result = mergeWithDefaults(
      {
        nested: {
          config: defaultConfig,
          enabled: false,
        },
      },
      {
        nested: {
          config: customConfig,
        },
      },
    );

    assert.equal(result.nested.config, customConfig);
    assert.deepEqual(result, {
      nested: {
        config: customConfig,
        enabled: false,
      },
    });
  });

  it('should not mutate defaults or args while merging', () => {
    const defaults = {
      nested: {
        enabled: false,
        count: 1,
      },
    };
    const args = {
      nested: {
        enabled: true,
      },
    };

    const result = mergeWithDefaults(defaults, args);

    assert.notEqual(result, defaults);
    assert.notEqual(result.nested, defaults.nested);
    assert.notEqual(result.nested, args.nested);
    assert.deepEqual(defaults, {
      nested: {
        enabled: false,
        count: 1,
      },
    });
    assert.deepEqual(args, {
      nested: {
        enabled: true,
      },
    });
  });
});
