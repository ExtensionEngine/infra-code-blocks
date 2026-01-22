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
export const applyImmediately = true;
export const allowMajorVersionUpgrade = true;
export const autoMinorVersionUpgrade = false;
export const allocatedStorage = 10;
export const maxAllocatedStorage = 50;
