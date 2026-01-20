import * as aws from '@pulumi/aws-v7';
import * as config from './config';
import * as pulumi from '@pulumi/pulumi';
import { next as studion } from '@studion/infra-code-blocks';

const parent = new pulumi.ComponentResource(
  'studion:database:TestGroup',
  `${config.appName}-root`,
);

const vpc = new studion.Vpc(`${config.appName}-vpc`, {}, { parent });

const defaultDb = new studion.DatabaseBuilder(`${config.appName}-default-db`)
  .withInstance({
    dbName: config.dbName,
  })
  .withCredentials({
    username: config.dbUsername,
  })
  .withVpc(vpc.vpc)
  .build({ parent });

const kms = new aws.kms.Key(
  `${config.appName}-kms-key`,
  {
    description: `${config.appName} RDS encryption key`,
    customerMasterKeySpec: 'SYMMETRIC_DEFAULT',
    isEnabled: true,
    keyUsage: 'ENCRYPT_DECRYPT',
    multiRegion: false,
    enableKeyRotation: true,
    tags: config.tags,
  },
  { parent },
);

const paramGroup = new aws.rds.ParameterGroup(
  `${config.appName}-parameter-group`,
  {
    family: 'postgres17',
    tags: config.tags,
  },
  { parent },
);

const configurableDb = new studion.DatabaseBuilder(
  `${config.appName}-configurable-db`,
)
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
  .build({ parent });

const snapshot = defaultDb.instance.dbInstanceIdentifier.apply(
  dbInstanceIdentifier => {
    return new aws.rds.Snapshot(
      `${config.appName}-snapshot`,
      {
        dbInstanceIdentifier: dbInstanceIdentifier!,
        dbSnapshotIdentifier: `${config.appName}-snapshot-id`,
        tags: config.tags,
      },
      { parent },
    );
  },
);

const snapshotDb = snapshot.apply(snapshot => {
  return new studion.DatabaseBuilder(`${config.appName}-snapshot-db`)
    .withInstance({
      applyImmediately: true,
    })
    .withVpc(vpc.vpc)
    .withTags(config.tags)
    .withSnapshot(snapshot.id)
    .build({ parent });
});

export {
  vpc,
  defaultDb,
  kms,
  paramGroup,
  configurableDb,
  snapshot,
  snapshotDb,
};
