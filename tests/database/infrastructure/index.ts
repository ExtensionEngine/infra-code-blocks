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

export { vpc, defaultDb, dbWithMonitoring, dbWithCustomParamGroup };
