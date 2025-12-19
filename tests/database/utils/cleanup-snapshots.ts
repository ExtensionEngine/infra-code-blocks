import {
  DeleteDBSnapshotCommand,
  DescribeDBSnapshotsCommand,
} from '@aws-sdk/client-rds';
import { createSpinner } from 'nanospinner';
import { DatabaseTestContext } from '../test-context';

export async function cleanupSnapshots(ctx: DatabaseTestContext) {
  const spinner = createSpinner('Deleting snapshots...').start();

  const dbs = [
    ctx.outputs.defaultDb.value,
    ctx.outputs.customDb.value,
    ctx.outputs.snapshotDb.value,
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
