import { it } from 'node:test';
import { RedisTestContext } from './test-context';
import assert = require('node:assert');
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import Redis from 'ioredis';

export function testUpstashRedis(ctx: RedisTestContext) {
  it('should create Upstash Redis database with correct configuration', async () => {
    const redis = ctx.outputs.upstashRedis.value;
    assert.ok(redis, 'Redis instance should be defined');
    assert.ok(redis.instance, 'Redis database should be defined');
    assert.ok(redis.password, 'Password component should be defined');
    assert.strictEqual(
      redis.instance.region,
      'global',
      'Global region should be defined',
    );
    assert.strictEqual(
      redis.instance.primaryRegion,
      'us-east-1',
      'Correct primary region should be defined',
    );
    assert.strictEqual(redis.instance.tls, true, 'TLS should be enabled');
    assert.strictEqual(
      redis.instance.eviction,
      true,
      'Eviction should be enabled',
    );
    assert.ok(redis.instance.endpoint, 'Redis should have endpoint');
    assert.ok(redis.instance.port, 'Redis should have port');
    assert.strictEqual(
      redis.username,
      'default',
      'Default username should be defined',
    );
    assert.ok(
      redis.instance.databaseName.includes(ctx.config.upstashRedisName),
      'Database name should include the base name',
    );
  });

  it('should connect to Upstash Redis instance', async () => {
    const redis = ctx.outputs.upstashRedis.value;
    const secretArn = redis.password.secret.arn;

    assert.ok(secretArn, 'Password secret ARN should be defined');

    const command = new GetSecretValueCommand({
      SecretId: secretArn,
    });
    const response = await ctx.clients.secretsManager.send(command);
    assert.ok(response.SecretString, 'Secret should contain a password');

    const client = new Redis({
      host: redis.instance.endpoint,
      port: redis.instance.port,
      tls: {},
      password: response.SecretString,
      connectTimeout: 10000,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    try {
      const pingResult = await client.ping();
      assert.strictEqual(pingResult, 'PONG', 'Redis should respond to ping');
    } finally {
      await client.disconnect();
    }
  });
}
