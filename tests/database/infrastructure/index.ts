import { next as studion } from '@studion/infra-code-blocks';
import * as config from './config';

const vpc = new studion.Vpc(config.projectName, {});

const database = new studion.DatabaseBuilder(config.instanceName)
  .configure(config.dbName, config.username, {
    password: config.password,
    applyImmediately: config.applyImmediately,
    skipFinalSnapshot: config.skipFinalSnapshot,
  })
  .withVpc(vpc.vpc)
  .build();

const dbWithMonitoring = new studion.DatabaseBuilder(
    `${config.instanceName}-w-monitoring`,
  )
  .configure(config.dbName, config.username, {
    password: config.password,
    applyImmediately: config.applyImmediately,
    skipFinalSnapshot: config.skipFinalSnapshot,
  })
  .withVpc(vpc.vpc)
  .withMonitoring()
  .build();

const dbWithParameterGroup = new studion.DatabaseBuilder(
    `${config.instanceName}-w-param-group`,
  )
  .configure(config.dbName, config.username, {
    password: config.password,
    applyImmediately: config.applyImmediately,
    skipFinalSnapshot: config.skipFinalSnapshot,
  })
  .withVpc(vpc.vpc)
  .withParameterGroup({
    family: 'postgres17'
  })
  .build();

  const dbWithReplica = new studion.DatabaseBuilder(
    `${config.instanceName}-w-replica`,
  )
  .configure(config.dbName, config.username, {
    password: config.password,
    applyImmediately: config.applyImmediately,
    skipFinalSnapshot: config.skipFinalSnapshot,
  })
  .withVpc(vpc.vpc)
  .withReplica()
  .build();

export { vpc, database, dbWithMonitoring, dbWithParameterGroup, dbWithReplica };
