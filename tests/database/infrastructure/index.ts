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

export { vpc, database, dbWithMonitoring };
