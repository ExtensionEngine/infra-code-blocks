import * as aws from '@pulumi/aws';
import { next as studion } from '@studion/infra-code-blocks';
import { DatabaseBuilder } from '../../../dist/v2/components/database/builder';
import * as config from './config';

const vpc = new studion.Vpc(`${config.appName}-vpc`, {});

const defaultDb = new DatabaseBuilder(`${config.appName}-default`)
  .withInstance({
    dbName: config.dbName,
  })
  .withCredentials({
    username: config.dbUsername,
  })
  .withVpc(vpc.vpc)
  .build();

const kms = new aws.kms.Key(`${config.appName}-kms`, {
  description: `${config.appName} RDS encryption key`,
  customerMasterKeySpec: 'SYMMETRIC_DEFAULT',
  isEnabled: true,
  keyUsage: 'ENCRYPT_DECRYPT',
  multiRegion: false,
  enableKeyRotation: true,
  tags: config.tags,
});

const paramGroup = new aws.rds.ParameterGroup(
  `${config.appName}-parameter-group`,
  {
    family: 'postgres17',
    tags: config.tags,
  },
);

const customDb = new DatabaseBuilder(`${config.appName}-custom`)
  .withInstance({
    dbName: config.dbName,
    applyImmediately: config.applyImmediately,
    allowMajorVersionUpgrade: config.allowMajorVersionUpgrade,
    autoMinorVersionUpgrade: config.autoMinorVersionUpgrade,
  })
  .withCredentials({
    username: config.dbUsername,
    password: config.dbPassword,
  })
  .withStorage({
    allocatedStorage: config.allocatedStorage,
    maxAllocatedStorage: config.maxAllocatedStorage,
  })
  .withVpc(vpc.vpc)
  .withMonitoring()
  .withKms(kms.arn)
  .withParameterGroup(paramGroup.name)
  .withTags(config.tags)
  .build();

const snapshot = defaultDb.instance.dbInstanceIdentifier.apply(
  dbInstanceIdentifier => {
    if (!dbInstanceIdentifier) return;
    return new aws.rds.Snapshot(`${config.appName}-snapshot`, {
      dbInstanceIdentifier: dbInstanceIdentifier,
      dbSnapshotIdentifier: `${config.appName}-snap-db`,
      tags: config.tags,
    });
  },
);

const snapshotDb = snapshot.apply(snapshot => {
  if (!snapshot) return;
  return new DatabaseBuilder(`${config.appName}-snapshot`)
    .withVpc(vpc.vpc)
    .withTags(config.tags)
    .withSnapshot(snapshot.id)
    .build();
});

export { vpc, defaultDb, kms, paramGroup, customDb, snapshot, snapshotDb };
