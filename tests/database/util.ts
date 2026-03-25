import {
  DBInstanceNotFoundFault,
  DeleteDBInstanceCommand,
  DeleteDBSnapshotCommand,
  DescribeDBInstancesCommand,
  DescribeDBSnapshotsCommand,
} from '@aws-sdk/client-rds';
import { NonRetryableError, backOff } from '../util';
import { createSpinner } from 'nanospinner';
import { DatabaseTestContext } from './test-context';
import * as studion from '@studion/infra-code-blocks';

export async function cleanupSnapshots(ctx: DatabaseTestContext) {
  const spinner = createSpinner('Deleting snapshots...').start();

  const dbs = [
    ctx.outputs.defaultDb.value,
    ctx.outputs.configurableDb.value,
    ctx.outputs.snapshotDb.value,
    ctx.outputs.replicaDb.value,
    ctx.outputs.configurableReplicaDb.value,
    ctx.outputs.ssmConnectDb.value,
  ];
  await Promise.all(
    dbs.map(db => deleteSnapshot(ctx, db.instance.dbInstanceIdentifier)),
  );

  spinner.success({ text: 'Snapshots deleted' });
}

async function deleteSnapshot(
  ctx: DatabaseTestContext,
  DBInstanceIdentifier: string,
) {
  const describeCommand = new DescribeDBSnapshotsCommand({
    DBInstanceIdentifier,
    SnapshotType: 'manual',
  });
  const { DBSnapshots } = await ctx.clients.rds.send(describeCommand);

  if (!DBSnapshots || !DBSnapshots.length) {
    throw new Error('Snapshot not found');
  }
  const [DBSnapshot] = DBSnapshots;

  const deleteCommand = new DeleteDBSnapshotCommand({
    DBSnapshotIdentifier: DBSnapshot.DBSnapshotIdentifier,
  });
  await ctx.clients.rds.send(deleteCommand);
}

export async function cleanupReplicas(ctx: DatabaseTestContext) {
  const spinner = createSpinner('Deleting replicas...').start();

  const dbs = [
    ctx.outputs.replicaDb.value,
    ctx.outputs.configurableReplicaDb.value,
  ];
  await Promise.all(dbs.map(db => deleteReplica(ctx, db)));

  spinner.success({ text: 'Replicas deleted' });
}

async function deleteReplica(ctx: DatabaseTestContext, db: studion.Database) {
  const replicaDBInstanceId = db.replica!.instance
    .identifier as unknown as string;

  try {
    const deleteCommand = new DeleteDBInstanceCommand({
      DBInstanceIdentifier: replicaDBInstanceId,
      SkipFinalSnapshot: true,
    });

    await ctx.clients.rds.send(deleteCommand);
  } catch (err) {
    if (err instanceof DBInstanceNotFoundFault) {
      return;
    }

    throw err;
  }

  // Wait for replica to be deleted
  await backOff(async () => {
    try {
      const describeCommand = new DescribeDBInstancesCommand({
        DBInstanceIdentifier: replicaDBInstanceId,
      });
      const { DBInstances } = await ctx.clients.rds.send(describeCommand);

      if (DBInstances![0].DBInstanceStatus === 'deleting') {
        throw new Error('DB instance still deleting');
      }
    } catch (err) {
      if (err instanceof DBInstanceNotFoundFault) {
        return;
      }

      throw err;
    }
  });

  // Wait for primary instance to exit modifying state
  await backOff(async () => {
    try {
      const primaryDBInstanceId = db.instance
        .dbInstanceIdentifier as unknown as string;
      const describeCommand = new DescribeDBInstancesCommand({
        DBInstanceIdentifier: primaryDBInstanceId,
      });
      const { DBInstances } = await ctx.clients.rds.send(describeCommand);

      if (DBInstances![0].DBInstanceStatus === 'modifying') {
        throw new Error('DB instance still modifying');
      }
    } catch (err) {
      if (err instanceof DBInstanceNotFoundFault) {
        throw new NonRetryableError('Db instance not found', { cause: err });
      }
    }
  });
}
