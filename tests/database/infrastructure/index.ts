import * as aws from '@pulumi/aws-v7';
import * as config from './config';
import * as pulumi from '@pulumi/pulumi';
import * as studion from '@studion/infra-code-blocks';
import * as util from '../../util';

const parent = new pulumi.ComponentResource(
  'studion:database:TestGroup',
  `${config.appName}-root`,
);

const vpc = util.getCommonVpc();

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

const replicaDb = new studion.DatabaseBuilder(`${config.appName}-replica-db`)
  .withInstance({
    dbName: config.dbName,
  })
  .withCredentials({
    username: config.dbUsername,
  })
  .withReplica()
  .withVpc(vpc.vpc)
  .build({ parent });

const configurableReplicaDb = new studion.DatabaseBuilder(
  `${config.appName}-config-replica-db`,
)
  .withInstance({
    dbName: config.dbName,
  })
  .withCredentials({
    username: config.dbUsername,
  })
  .withParameterGroup(paramGroup.name)
  .withMonitoring()
  .withTags(config.tags)
  .withReplica({
    enableMonitoring: true,
    parameterGroupName: paramGroup.name,
    applyImmediately: config.applyImmediately,
    allowMajorVersionUpgrade: config.allowMajorVersionUpgrade,
    autoMinorVersionUpgrade: config.autoMinorVersionUpgrade,
    tags: config.tags,
  })
  .withVpc(vpc.vpc)
  .build({ parent });

const ssmConnectDb = new studion.DatabaseBuilder(
  `${config.appName}-ssm-connect-db`,
)
  .withInstance({
    dbName: config.dbName,
  })
  .withCredentials({
    username: config.dbUsername,
  })
  .withSSMConnect()
  .withVpc(vpc.vpc)
  .build({ parent });

export {
  vpc,
  defaultDb,
  kms,
  paramGroup,
  configurableDb,
  snapshot,
  snapshotDb,
  replicaDb,
  configurableReplicaDb,
  ssmConnectDb,
};
