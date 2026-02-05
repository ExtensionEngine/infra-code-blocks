import * as assert from 'node:assert';
import { DatabaseTestContext } from './test-context';
import { DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { it } from 'node:test';

export function testReplicaDb(ctx: DatabaseTestContext) {
  it('should create a primary instance with a replica', async () => {
    const replicaDb = ctx.outputs.replicaDb.value;
    const { dbInstanceIdentifier } = replicaDb.instance;

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: dbInstanceIdentifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances &&
        DBInstances.length === 1 &&
        DBInstances[0].DBInstanceIdentifier === dbInstanceIdentifier,
      'Primary database instance should be created',
    );
  });

  it('should create a replica', async () => {
    const replicaDb = ctx.outputs.replicaDb.value;
    const { identifier } = replicaDb.replica.instance;

    assert.ok(replicaDb.replica, 'Replica should be defined');

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
  });

  it('should properly associate primary instance with a replica', async () => {
    const replicaDb = ctx.outputs.replicaDb.value;

    const dbInstance = replicaDb.instance;
    const replicaInstance = replicaDb.replica.instance;

    assert.strictEqual(
      replicaInstance.replicateSourceDb,
      dbInstance.dbInstanceIdentifier,
      'Replica instance should have correct source db instance identifier',
    );

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: dbInstance.dbInstanceIdentifier,
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
        ReadReplicaDBInstanceIdentifiers.length === 1,
      'Database instance should have associated read replica instance',
    );
    const [ReadReplicaDBInstanceIdentifier] = ReadReplicaDBInstanceIdentifiers;
    assert.strictEqual(
      ReadReplicaDBInstanceIdentifier,
      replicaInstance.identifier,
      'Database instance should have correct replica instance associated',
    );
  });

  it('should configure replica instance with correct defaults', () => {
    const replicaDb = ctx.outputs.replicaDb.value;

    const primaryInstance = replicaDb.instance;
    const replicaInstance = replicaDb.replica.instance;

    assert.partialDeepStrictEqual(
      replicaInstance,
      {
        multiAz: false,
        applyImmediately: false,
        allocatedStorage: 20,
        maxAllocatedStorage: 100,
        instanceClass: 'db.t4g.micro',
        performanceInsightsEnabled: false,
        allowMajorVersionUpgrade: false,
        autoMinorVersionUpgrade: true,
        engineVersion: '17.2',
        engine: 'postgres',
        storageEncrypted: true,
        publiclyAccessible: false,
        skipFinalSnapshot: true,
        vpcSecurityGroupIds: primaryInstance.vpcSecurityGroups,
        dbSubnetGroupName: primaryInstance.dbSubnetGroupName,
        parameterGroupName: primaryInstance.dbParameterGroupName,
      },
      'Replica instance should be configured correctly',
    );
  });
}
