import { next as studion } from '@studion/infra-code-blocks';
import * as config from './config';

export const vpc = new studion.Vpc(config.projectName, {});

export const database = new studion.DatabaseBuilder(config.instanceName)
  .configure(
    config.dbName,
    config.username,
    {
      password: config.password,
      applyImmediately: config.applyImmediately,
      skipFinalSnapshot: config.skipFinalSnapshot
    },
  )
  .withVpc(vpc.vpc)
  .build();
