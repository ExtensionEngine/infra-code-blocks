import * as pulumi from '@pulumi/pulumi';

export const appName = 'db-test';
export const stackName = pulumi.getStack();
export const tags = {
  Project: appName,
  Environment: stackName,
};
export const dbName = 'dbname';
export const dbUsername = 'dbusername';
export const dbPassword = 'dbpassword';
