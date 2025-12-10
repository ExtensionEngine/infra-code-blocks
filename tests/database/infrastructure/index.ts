import { next as studion } from '@studion/infra-code-blocks';
import * as config from './config';

const vpc = new studion.Vpc(`${config.appName}-vpc`, {});

const defaultDb = new studion.DatabaseBuilder(`${config.appName}-default`)
  .withInstance({
    dbName: config.dbName,
  })
  .withCredentials({
    username: config.dbUsername,
    password: config.dbPassword,
  })
  .withConfiguration({
    tags: config.tags,
  })
  .withVpc(vpc.vpc)
  .build();

export { vpc, defaultDb };
