import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

export type RdsArgs = {
  dbName: pulumi.Input<string>;
  username: pulumi.Input<string>;
  password: pulumi.Input<string>;
  subnetGroupName: pulumi.Input<string>;
  securityGroupIds: pulumi.Input<pulumi.Input<string>[]>;
  publiclyAccessible?: pulumi.Input<boolean>;
  applyImmediately?: pulumi.Input<boolean>;
  skipFinalSnapshot?: pulumi.Input<boolean>;
  allocatedStorage?: pulumi.Input<number>;
  maxAllocatedStorage?: pulumi.Input<number>;
  instanceClass?: pulumi.Input<string>;
};
export type RdsInstance = aws.rds.Instance;

export class Rds extends pulumi.ComponentResource {
  instance: RdsInstance;

  constructor(
    name: string,
    args: RdsArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:rds:Instance', name, {}, opts);

    const kms = new aws.kms.Key(
      `${name}-rds-key`,
      {
        customerMasterKeySpec: 'SYMMETRIC_DEFAULT',
        isEnabled: true,
        keyUsage: 'ENCRYPT_DECRYPT',
        multiRegion: false,
        enableKeyRotation: true,
      },
      { parent: this },
    );

    this.instance = new aws.rds.Instance(
      `${name}-rds`,
      {
        identifier: name,
        engine: 'postgres',
        engineVersion: '14.9',
        allocatedStorage: args.allocatedStorage || 20,
        maxAllocatedStorage: args.maxAllocatedStorage || 100,
        instanceClass: args.instanceClass || 'db.t3.micro',
        dbName: args.dbName,
        username: args.username,
        password: args.password,
        dbSubnetGroupName: args.subnetGroupName,
        vpcSecurityGroupIds: args.securityGroupIds,
        storageEncrypted: true,
        kmsKeyId: kms.arn,
        publiclyAccessible: args.publiclyAccessible || false,
        skipFinalSnapshot: args.skipFinalSnapshot || false,
        applyImmediately: args.applyImmediately || false,
        autoMinorVersionUpgrade: true,
        maintenanceWindow: 'Mon:07:00-Mon:07:30',
        finalSnapshotIdentifier: `${name}-final-snapshot`,
        backupWindow: '06:00-06:30',
        backupRetentionPeriod: 14,
      },
      { parent: this },
    );

    this.registerOutputs();
  }
}
