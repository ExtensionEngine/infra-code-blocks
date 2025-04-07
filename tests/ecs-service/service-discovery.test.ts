import { it } from 'node:test';
import * as assert from 'node:assert';
import { backOff } from 'exponential-backoff';
import { EcsTestContext } from './test-context';
import { GetNamespaceCommand, ListInstancesCommand } from '@aws-sdk/client-servicediscovery';

export function testEcsServiceWithServiceDiscovery(ctx: EcsTestContext) {
  it('should create a private DNS namespace for service discovery', async () => {
    const ecsWithDiscovery = ctx.outputs.ecsWithDiscovery.value;
    const namespace = ecsWithDiscovery.serviceDiscoveryService?.namespaceId;

    assert.ok(namespace, 'Service discovery namespace should be created');

    const command = new GetNamespaceCommand({ Id: namespace });
    const { Namespace } = await ctx.clients.sd.send(command);

    assert.ok(Namespace, 'Namespace should exist');
    assert.strictEqual(Namespace.Type, 'DNS_PRIVATE', 'Should be a private DNS namespace');
    assert.strictEqual(Namespace.Name, ecsWithDiscovery.name, 'Namespace name should match service name');
  });

  it('should register the service in service discovery', async () => {
    const ecsWithDiscovery = ctx.outputs.ecsWithDiscovery.value;
    const serviceId = ecsWithDiscovery.serviceDiscoveryService?.id;

    assert.ok(serviceId, 'Service discovery service should be created');

    return backOff(async () => {
      const command = new ListInstancesCommand({ ServiceId: serviceId });
      const { Instances } = await ctx.clients.sd.send(command);

      assert.ok(Instances && Instances.length > 0, 'Service should have registered instances');
    }, ctx.config.exponentialBackOffConfig);
  });

}
