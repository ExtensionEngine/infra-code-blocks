import { appName, dbName, dbUsername } from './config';
import { next as studion } from '@studion/infra-code-blocks';
import { DatabaseBuilder } from '../../../dist/v2/components/database/builder';

const vpc = new studion.Vpc(`${appName}-vpc`, {});

const defaultDb = new DatabaseBuilder(`${appName}-default-db`)
  .withInstance({
    dbName,
  })
  .withCredentials({
    username: dbUsername,
  })
  .withVpc(vpc.vpc)
  .build();

export { vpc, defaultDb };
