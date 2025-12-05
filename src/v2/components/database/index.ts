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
  dbSubnetGroup: aws.rds.SubnetGroup;
  dbSecurityGroup: aws.ec2.SecurityGroup;
  password: Password;
  encryptedSnapshotCopy?: aws.rds.SnapshotCopy;
  monitoringRole?: aws.iam.Role;
  kmsKeyId: pulumi.Output<string>;

  constructor(
    name: string,
    args: Database.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Database', name, {}, opts);

    this.name = name;

    const argsWithDefaults = Object.assign({}, defaults, args);
    const {
      kmsKeyId,
      snapshotIdentifier,
      enableMonitoring,
    } = argsWithDefaults;

    const vpc = pulumi.output(argsWithDefaults.vpc);
    this.dbSubnetGroup = this.createSubnetGroup(vpc.isolatedSubnetIds);
    this.dbSecurityGroup = this.createSecurityGroup(
      vpc.vpcId,
      vpc.vpc.cidrBlock,
    );

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

  private createSubnetGroup(
    isolatedSubnetIds: awsx.ec2.Vpc['isolatedSubnetIds'],
  ) {
    const dbSubnetGroup = new aws.rds.SubnetGroup(
      `${this.name}-subnet-group`,
      {
        subnetIds: isolatedSubnetIds,
        tags: commonTags,
      },
      { parent: this },
    );
    return dbSubnetGroup;
  }

  private createSecurityGroup(
    vpcId: awsx.ec2.Vpc['vpcId'],
    vpcCidrBlock: pulumi.Input<string>,
  ) {
    const dbSecurityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId,
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 5432,
            toPort: 5432,
            cidrBlocks: [vpcCidrBlock],
          },
        ],
        tags: commonTags,
      },
      { parent: this },
    );
    return dbSecurityGroup;
  }

  private createEncryptionKey() {
    const kms = new aws.kms.Key(
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
    return kms;
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
    });

    new aws.iam.RolePolicyAttachment(
      `${this.name}-rds-monitoring-role-attachment`,
      {
        role: monitoringRole.name,
        policyArn:
          'arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole',
      },
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
      )
      .apply(snapshot => snapshot.dbSnapshotArn);

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
