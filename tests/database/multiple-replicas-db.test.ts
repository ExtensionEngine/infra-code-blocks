import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { it } from 'node:test';

export function testMultipleReplicasDb(ctx: DatabaseTestContext) {
  it('should create a primary instance with multiple replicas', async () => {
    const multipleReplicasDb = ctx.outputs.multipleReplicasDb.value;
    const { identifier } = multipleReplicasDb.instance;

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: identifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances &&
        DBInstances.length === 1 &&
        DBInstances[0].DBInstanceIdentifier === identifier,
      'Primary database instance should be created',
    );
  });

  it('should create multiple replicas', async () => {
    const multipleReplicasDb = ctx.outputs.multipleReplicasDb.value;

    assert.ok(
      multipleReplicasDb.replicas && multipleReplicasDb.replicas.length === 3,
      'Multiple replicas should be defined',
    );

    assert.ok(
      multipleReplicasDb.replicas[0].name ===
        `${ctx.config.appName}-multi-replicas-one`,
      'Replica should have correct name',
    );

    assert.ok(
      multipleReplicasDb.replicas[1].name ===
        `${ctx.config.appName}-multi-replicas-two`,
      'Replica should have correct name',
    );

    assert.ok(
      multipleReplicasDb.replicas[2].name ===
        `${ctx.config.appName}-multi-replicas-three`,
      'Replica should have correct name',
    );

    await Promise.all(
      multipleReplicasDb.replicas.map(
        async ({
          instance: { identifier },
        }: {
          instance: { identifier: string };
        }) => {
          const command = new DescribeDBInstancesCommand({
            DBInstanceIdentifier: identifier,
          });

          const { DBInstances } = await ctx.clients.rds.send(command);
          assert.ok(
            DBInstances &&
              DBInstances.length === 1 &&
              DBInstances[0].DBInstanceIdentifier === identifier,
            'Replica instance should be created',
          );
        },
      ),
    );
  });

  it('should properly associate primary instance with multiple replicas', async () => {
    const multipleReplicasDb = ctx.outputs.multipleReplicasDb.value;

    const primarayDbInstance = multipleReplicasDb.instance;

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: primarayDbInstance.identifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances && DBInstances.length === 1,
      'Database instance should be created',
    );
    const [DBInstance] = DBInstances;
    const { ReadReplicaDBInstanceIdentifiers } = DBInstance;
    assert.ok(
      ReadReplicaDBInstanceIdentifiers &&
        ReadReplicaDBInstanceIdentifiers.length === 3,
      'Database instance should have multiple read replica instances associated',
    );

    multipleReplicasDb.replicas.forEach(
      ({ instance: { identifier } }: { instance: { identifier: string } }) => {
        assert.ok(
          ReadReplicaDBInstanceIdentifiers.includes(identifier),
          'Database instance should have all replica instances associated',
        );
      },
    );
  });
}
