import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { next as studion } from '@studion/infra-code-blocks';
import * as config from './config';

const vpc = new studion.Vpc(`${config.appName}-vpc`, {});

const defaultDb = new studion.DatabaseBuilder(
    `${config.appName}-default`
  )
  .configure(config.dbName, config.dbUsername, {
    password: config.dbPassword,
    tags: config.tags,
  })
  .withVpc(vpc.vpc)
  .build();

const dbWithMonitoring = new studion.DatabaseBuilder(
    `${config.appName}-w-monitoring`
  )
  .configure(config.dbName, config.dbUsername, {
    password: config.dbPassword,
    tags: config.tags,
    applyImmediately: true,
  })
  .withVpc(vpc.vpc)
  .withMonitoring()
  .build();

const dbWithCustomParamGroup = new studion.DatabaseBuilder(
    `${config.appName}-w-param-group`
  )
  .configure(config.dbName, config.dbUsername, {
    password: config.dbPassword,
    tags: config.tags,
    applyImmediately: true,
  })
  .withVpc(vpc.vpc)
  .withCustomParameterGroup({
    family: 'postgres17'
  })
  .build();

const customKms = new aws.kms.Key(
  `${config.appName}-custom-kms-key`,
  {
    description: `${config.appName} RDS encryption key`,
    customerMasterKeySpec: 'SYMMETRIC_DEFAULT',
    isEnabled: true,
    keyUsage: 'ENCRYPT_DECRYPT',
    multiRegion: false,
    enableKeyRotation: true,
    tags: config.tags,
  }
);

const dbWithCustomKms = new studion.DatabaseBuilder(
    `${config.appName}-w-kms-key`
  )
  .configure(config.dbName, config.dbUsername, {
    password: config.dbPassword,
    tags: config.tags,
  })
  .withVpc(vpc.vpc)
  .withCustomKms(customKms)
  .build();


const snapshot = new aws.rds.Snapshot(
    `${config.appName}-snapshot`,
  {
    dbInstanceIdentifier: defaultDb.instance.dbInstanceIdentifier as unknown as string,
    dbSnapshotIdentifier: `${config.appName}-snap-db`,
    tags: config.tags,
  }
);

const dbFromSnapshot = snapshot.id.apply(snapId => {
  return new studion.DatabaseBuilder(
    `${config.appName}-snap-database`
    )
    .createFromSnapshot(snapId)
    .withVpc(vpc.vpc)
    .build();
});

export {
  vpc,
  defaultDb,
  dbWithMonitoring,
  dbWithCustomParamGroup,
  customKms,
  dbWithCustomKms,
  snapshot,
  dbFromSnapshot,
};
