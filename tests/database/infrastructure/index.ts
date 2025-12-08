import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { next as studion } from '@studion/infra-code-blocks';
import * as config from './config';

const vpc = new studion.Vpc(`${config.appName}-vpc`, {});

const defaultDb = new studion.DatabaseBuilder(`${config.appName}-default`)
  .withConfiguration({
    dbName: config.dbName,
    username: config.dbUsername,
    password: config.dbPassword,
    tags: config.tags,
  })
  .withVpc(vpc.vpc)
  .build();

const dbWithMonitoring = new studion.DatabaseBuilder(
  `${config.appName}-w-monitoring`,
)
  .withConfiguration({
    dbName: config.dbName,
    username: config.dbUsername,
    password: config.dbPassword,
    tags: config.tags,
  })
  .withVpc(vpc.vpc)
  .withMonitoring()
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

const dbWithKms = new studion.DatabaseBuilder(`${config.appName}-w-kms`)
  .withConfiguration({
    dbName: config.dbName,
    username: config.dbUsername,
    password: config.dbPassword,
    tags: config.tags,
  })
  .withVpc(vpc.vpc)
  .withKms(kms.arn)
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

const dbWithSnapshot = snapshot.apply(snap => {
  if (!snap) return;
  return new studion.DatabaseBuilder(`${config.appName}-w-snapshot`)
    .withConfiguration({
      tags: config.tags,
    })
    .withVpc(vpc.vpc)
    .withSnapshot(snap.id)
    .build();
});

export {
  vpc,
  kms,
  snapshot,
  defaultDb,
  dbWithMonitoring,
  dbWithKms,
  dbWithSnapshot,
};
