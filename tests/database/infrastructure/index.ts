import { Project, next as studion } from '@studion/infra-code-blocks';
import * as config from './config';

export const project = new Project(config.projectName, { services: [] });

export const database = new studion.DatabaseBuilder(config.instanceName)
  .configure(
    {
      dbName: config.dbName,
      username: config.username,
      password: config.password,
      applyImmediately: config.applyImmediately,
      skipFinalSnapshot: config.skipFinalSnapshot
    },
  )
  .withVpc(project.vpc)
  .build({ parent: project });
