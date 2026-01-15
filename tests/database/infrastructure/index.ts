import { appName, dbName, dbUsername } from './config';
import * as pulumi from '@pulumi/pulumi';
import { next as studion } from '@studion/infra-code-blocks';
import { DatabaseBuilder } from '../../../dist/v2/components/database/builder';

const parent = new pulumi.ComponentResource(
  'studion:database:TestGroup',
  `${appName}-root`,
);

const vpc = new studion.Vpc(`${appName}-vpc`, {}, { parent });

const defaultDb = new DatabaseBuilder(`${appName}-default-db`)
  .withInstance({
    dbName,
  })
  .withCredentials({
    username: dbUsername,
  })
  .withVpc(vpc.vpc)
  .build({ parent });

export { vpc, defaultDb };
