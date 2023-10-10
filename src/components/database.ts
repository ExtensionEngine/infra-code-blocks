import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';

export type DatabaseArgs = {
  /**
   * The name of the database to create when the DB instance is created.
   */
  dbName: pulumi.Input<string>;
  /**
   * Username for the master DB user.
   */
  username: pulumi.Input<string>;
  /**
   * Password for the master DB user.
   */
  password: pulumi.Input<string>;
  /**
   * The awsx.ec2.Vpc resource.
   */
  vpc: awsx.ec2.Vpc;
  /**
   * Specifies whether any database modifications are applied immediately, or during the next maintenance window. Default is false.
   */
  applyImmediately?: pulumi.Input<boolean>;
  /**
   * Determines whether a final DB snapshot is created before the DB instance is deleted.
   */
  skipFinalSnapshot?: pulumi.Input<boolean>;
  /**
   * The allocated storage in gibibytes.
   */
  allocatedStorage?: pulumi.Input<number>;
  /**
   * The upper limit to which Amazon RDS can automatically scale the storage of the DB instance.
   */
  maxAllocatedStorage?: pulumi.Input<number>;
  /**
   * The instance type of the RDS instance.
   */
  instanceClass?: pulumi.Input<string>;
};

const defaults = {
  applyImmediately: false,
  skipFinalSnapshot: false,
  allocatedStorage: 20,
  maxAllocatedStorage: 100,
  instanceClass: 'db.t3.micro',
};

export class Database extends pulumi.ComponentResource {
  instance: aws.rds.Instance;
  kms: aws.kms.Key;
  dbSubnetGroup: aws.rds.SubnetGroup;
  dbSecurityGroup: aws.ec2.SecurityGroup;

  constructor(
    name: string,
    args: DatabaseArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Database', name, {}, opts);

    const argsWithDefaults = Object.assign({}, defaults, args);

    this.dbSubnetGroup = new aws.rds.SubnetGroup(
      `${name}-subnet-group`,
      {
        subnetIds: argsWithDefaults.vpc.privateSubnetIds,
      },
      { parent: this },
    );

    this.dbSecurityGroup = new aws.ec2.SecurityGroup(
      `${name}-security-group`,
      {
        vpcId: argsWithDefaults.vpc.vpcId,
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 5432,
            toPort: 5432,
            cidrBlocks: [argsWithDefaults.vpc.vpc.cidrBlock],
          },
        ],
      },
      { parent: this },
    );

    this.kms = new aws.kms.Key(
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
        allocatedStorage: argsWithDefaults.allocatedStorage,
        maxAllocatedStorage: argsWithDefaults.maxAllocatedStorage,
        instanceClass: argsWithDefaults.instanceClass,
        dbName: argsWithDefaults.dbName,
        username: argsWithDefaults.username,
        password: argsWithDefaults.password,
        dbSubnetGroupName: this.dbSubnetGroup.name,
        vpcSecurityGroupIds: [this.dbSecurityGroup.id],
        storageEncrypted: true,
        kmsKeyId: this.kms.arn,
        publiclyAccessible: false,
        skipFinalSnapshot: argsWithDefaults.skipFinalSnapshot,
        applyImmediately: argsWithDefaults.applyImmediately,
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
