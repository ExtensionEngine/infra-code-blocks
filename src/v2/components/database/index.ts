import * as aws from '@pulumi/aws';
import * as awsNative from '@pulumi/aws-native';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import { Password } from '../../../components/password';
import { commonTags } from '../../../constants';

export namespace Database {
  export type Args = {
    dbName?: pulumi.Input<string>;
    username?: pulumi.Input<string>;
    password?: pulumi.Input<string>;
    vpc: pulumi.Input<awsx.ec2.Vpc>;
    multiAz?: pulumi.Input<boolean>;
    applyImmediately?: pulumi.Input<boolean>;
    allocatedStorage?: pulumi.Input<string>;
    maxAllocatedStorage?: pulumi.Input<number>;
    instanceClass?: pulumi.Input<string>;
    allowMajorVersionUpgrade?: pulumi.Input<boolean>;
    autoMinorVersionUpgrade?: pulumi.Input<boolean>;
    kmsKeyId?: pulumi.Input<string>;
    parameterGroupName?: pulumi.Input<string>;
    snapshotIdentifier?: pulumi.Input<string>;
    enableMonitoring?: pulumi.Input<boolean>;
    engineVersion?: pulumi.Input<string>;
    tags?: pulumi.Input<{
      [key: string]: pulumi.Input<string>;
    }>;
  };
}

const defaults = {
  multiAz: false,
  applyImmediately: false,
  allocatedStorage: '20',
  maxAllocatedStorage: 100,
  instanceClass: 'db.t4g.micro',
  enableMonitoring: false,
  allowMajorVersionUpgrade: false,
  autoMinorVersionUpgrade: true,
  engineVersion: '17.2',
};

export class Database extends pulumi.ComponentResource {
  name: string;
  instance: awsNative.rds.DbInstance;
  vpc: pulumi.Output<awsx.ec2.Vpc>;
  dbSubnetGroup: aws.rds.SubnetGroup;
  dbSecurityGroup: aws.ec2.SecurityGroup;
  password: Password;
  kmsKeyId: pulumi.Output<string>;
  monitoringRole?: aws.iam.Role;
  encryptedSnapshotCopy?: aws.rds.SnapshotCopy;

  constructor(
    name: string,
    args: Database.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Database', name, {}, opts);

    this.name = name;

    const argsWithDefaults = Object.assign({}, defaults, args);
    const {
      vpc,
      kmsKeyId,
      enableMonitoring,
      snapshotIdentifier,
    } = argsWithDefaults;

    this.vpc = pulumi.output(vpc);
    this.dbSubnetGroup = this.createSubnetGroup();
    this.dbSecurityGroup = this.createSecurityGroup();

    this.password = new Password(
      `${this.name}-database-password`,
      { value: args.password },
      { parent: this },
    );

    this.kmsKeyId = kmsKeyId
      ? pulumi.output(kmsKeyId)
      : this.createEncryptionKey().arn;

    if (enableMonitoring) {
      this.monitoringRole = this.createMonitoringRole();
    }

    if (snapshotIdentifier) {
      this.encryptedSnapshotCopy =
        this.createEncryptedSnapshotCopy(snapshotIdentifier);
    }

    this.instance = this.createDatabaseInstance(argsWithDefaults);

    this.registerOutputs();
  }

  private createSubnetGroup() {
    return new aws.rds.SubnetGroup(
      `${this.name}-subnet-group`,
      {
        subnetIds: this.vpc.isolatedSubnetIds,
        tags: commonTags,
      },
      { parent: this },
    );
  }

  private createSecurityGroup() {
    return new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId: this.vpc.vpcId,
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 5432,
            toPort: 5432,
            cidrBlocks: [this.vpc.vpc.cidrBlock],
          },
        ],
        tags: commonTags,
      },
      { parent: this },
    );
  }

  private createEncryptionKey() {
    return new aws.kms.Key(
      `${this.name}-rds-key`,
      {
        description: `${this.name} RDS encryption key`,
        customerMasterKeySpec: 'SYMMETRIC_DEFAULT',
        isEnabled: true,
        keyUsage: 'ENCRYPT_DECRYPT',
        multiRegion: false,
        enableKeyRotation: true,
        tags: commonTags,
      },
      { parent: this },
    );
  }

  private createMonitoringRole() {
    const monitoringRole = new aws.iam.Role(`${this.name}-rds-monitoring`, {
      assumeRolePolicy: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'monitoring.rds.amazonaws.com',
            },
          },
        ],
      },
    },
    { parent: this },
  );

    new aws.iam.RolePolicyAttachment(
      `${this.name}-rds-monitoring-role-attachment`,
      {
        role: monitoringRole.name,
        policyArn:
          'arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole',
      },
      { parent: this },
    );

    return monitoringRole;
  }

  private createEncryptedSnapshotCopy(
    snapshotIdentifier: pulumi.Input<string>,
  ) {
    const sourceDbSnapshotIdentifier = pulumi
      .output(snapshotIdentifier)
      .apply(snapshotIdentifier =>
        aws.rds.getSnapshot({
          dbSnapshotIdentifier: snapshotIdentifier,
        }),
      ).dbSnapshotArn;

    const encryptedSnapshotCopy = new aws.rds.SnapshotCopy(
      `${this.name}-encrypted-snapshot-copy`,
      {
        sourceDbSnapshotIdentifier,
        targetDbSnapshotIdentifier: `${snapshotIdentifier}-encrypted-copy`,
        kmsKeyId: this.kmsKeyId,
      },
      { parent: this },
    );
    return encryptedSnapshotCopy;
  }

  private createDatabaseInstance(args: Database.Args) {
    const monitoringOptions =
      args.enableMonitoring && this.monitoringRole
        ? {
            monitoringInterval: 60,
            monitoringRoleArn: this.monitoringRole.arn,
            enablePerformanceInsights: true,
            performanceInsightsRetentionPeriod: 7,
          }
        : {};

    const instance = new awsNative.rds.DbInstance(
      `${this.name}-rds`,
      {
        dbInstanceIdentifier: `${this.name}-db-instance`,
        engine: 'postgres',
        engineVersion: args.engineVersion,
        dbInstanceClass: args.instanceClass,
        dbName: args.dbName,
        masterUsername: args.username,
        masterUserPassword: this.password.value,
        dbSubnetGroupName: this.dbSubnetGroup.name,
        vpcSecurityGroups: [this.dbSecurityGroup.id],
        allocatedStorage: args.allocatedStorage,
        maxAllocatedStorage: args.maxAllocatedStorage,
        multiAz: args.multiAz,
        applyImmediately: args.applyImmediately,
        allowMajorVersionUpgrade: args.allowMajorVersionUpgrade,
        autoMinorVersionUpgrade: args.autoMinorVersionUpgrade,
        kmsKeyId: this.kmsKeyId,
        storageEncrypted: true,
        publiclyAccessible: false,
        preferredMaintenanceWindow: 'Mon:07:00-Mon:07:30',
        preferredBackupWindow: '06:00-06:30',
        backupRetentionPeriod: 14,
        caCertificateIdentifier: 'rds-ca-rsa2048-g1',
        dbParameterGroupName: args.parameterGroupName,
        dbSnapshotIdentifier:
          this.encryptedSnapshotCopy?.targetDbSnapshotIdentifier,
        ...monitoringOptions,
        tags: [
          ...Object.entries({ ...commonTags, ...args.tags }).map(
            ([key, value]) => ({ key, value }),
          ),
        ],
      },
      { parent: this, dependsOn: [this.password] },
    );
    return instance;
  }
}
