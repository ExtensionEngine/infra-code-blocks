import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import { Password } from '../../../components/password';
import { commonTags } from '../../../constants';

export namespace Database {
  export type Args = {
    dbName: pulumi.Input<string>;
    username: pulumi.Input<string>;
    vpc: pulumi.Input<awsx.ec2.Vpc>;
    multiAz?: pulumi.Input<boolean>;
    password?: pulumi.Input<string>;
    applyImmediately?: pulumi.Input<boolean>;
    skipFinalSnapshot?: pulumi.Input<boolean>;
    allocatedStorage?: pulumi.Input<number>;
    maxAllocatedStorage?: pulumi.Input<number>;
    instanceClass?: pulumi.Input<string>;
    enableMonitoring?: pulumi.Input<boolean>;
    allowMajorVersionUpgrade?: pulumi.Input<boolean>;
    autoMinorVersionUpgrade?: pulumi.Input<boolean>;
    parameterGroupName?: pulumi.Input<string>;
    snapshotIdentifier?: pulumi.Input<string>;
    engineVersion?: pulumi.Input<string>;
    tags?: pulumi.Input<{
      [key: string]: pulumi.Input<string>;
    }>;
  };
}

const defaults = {
  multiAz: false,
  applyImmediately: false,
  skipFinalSnapshot: false,
  allocatedStorage: 20,
  maxAllocatedStorage: 100,
  instanceClass: 'db.t4g.micro',
  enableMonitoring: false,
  allowMajorVersionUpgrade: false,
  autoMinorVersionUpgrade: true,
  engineVersion: '17.2',
};

export class Database extends pulumi.ComponentResource {
  name: string;
  instance: aws.rds.Instance;
  kms: aws.kms.Key;
  dbSubnetGroup: aws.rds.SubnetGroup;
  dbSecurityGroup: aws.ec2.SecurityGroup;
  password: Password;
  encryptedSnapshotCopy?: aws.rds.SnapshotCopy;
  monitoringRole?: aws.iam.Role;

  constructor(
    name: string,
    args: Database.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:LegacyDatabase', name, {}, opts);

    this.name = name;

    const argsWithDefaults = Object.assign({}, defaults, args);
    const {
      enableMonitoring,
      snapshotIdentifier,
    } = argsWithDefaults;

    const vpc = pulumi.output(argsWithDefaults.vpc);
    this.dbSubnetGroup = this.createSubnetGroup(vpc.isolatedSubnetIds);
    this.dbSecurityGroup = this.createSecurityGroup(vpc.vpcId, vpc.vpc.cidrBlock);

    this.kms = this.createEncryptionKey();
    this.password = new Password(
      `${this.name}-database-password`,
      { value: args.password },
      { parent: this },
    );
    if (enableMonitoring) {
      this.monitoringRole = this.createMonitoringRole();
    }
    if (snapshotIdentifier) {
      this.encryptedSnapshotCopy =
        this.createEncryptedSnapshotCopy(snapshotIdentifier);
    }
    this.instance = this.createDatabaseInstance(args);

    this.registerOutputs();
  }

  private createSubnetGroup(isolatedSubnetIds: awsx.ec2.Vpc['isolatedSubnetIds']) {
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
    vpcCidrBlock: pulumi.Input<string>) {
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
    snapshotIdentifier: NonNullable<Database.Args['snapshotIdentifier']>,
  ) {
    const encryptedSnapshotCopy = new aws.rds.SnapshotCopy(
      `${this.name}-encrypted-snapshot-copy`,
      {
        sourceDbSnapshotIdentifier: snapshotIdentifier,
        targetDbSnapshotIdentifier: `${snapshotIdentifier}-encrypted-copy`,
        kmsKeyId: this.kms.arn,
      },
      { parent: this },
    );
    return encryptedSnapshotCopy;
  }

  private createDatabaseInstance(args: Database.Args) {
    const argsWithDefaults = Object.assign({}, defaults, args);
    const stack = pulumi.getStack();

    const monitoringOptions =
      argsWithDefaults.enableMonitoring && this.monitoringRole
        ? {
            monitoringInterval: 60,
            monitoringRoleArn: this.monitoringRole.arn,
            performanceInsightsEnabled: true,
            performanceInsightsRetentionPeriod: 7,
          }
        : {};

    const instance = new aws.rds.Instance(
      `${this.name}-rds`,
      {
        identifierPrefix: `${this.name}-`,
        engine: 'postgres',
        engineVersion: argsWithDefaults.engineVersion,
        allocatedStorage: argsWithDefaults.allocatedStorage,
        maxAllocatedStorage: argsWithDefaults.maxAllocatedStorage,
        instanceClass: argsWithDefaults.instanceClass,
        dbName: argsWithDefaults.dbName,
        username: argsWithDefaults.username,
        password: this.password.value,
        dbSubnetGroupName: this.dbSubnetGroup.name,
        vpcSecurityGroupIds: [this.dbSecurityGroup.id],
        storageEncrypted: true,
        kmsKeyId: this.kms.arn,
        multiAz: argsWithDefaults.multiAz,
        publiclyAccessible: false,
        skipFinalSnapshot: argsWithDefaults.skipFinalSnapshot,
        applyImmediately: argsWithDefaults.applyImmediately,
        maintenanceWindow: 'Mon:07:00-Mon:07:30',
        finalSnapshotIdentifier: `${this.name}-final-snapshot-${stack}`,
        backupWindow: '06:00-06:30',
        backupRetentionPeriod: 14,
        caCertIdentifier: 'rds-ca-rsa2048-g1',
        parameterGroupName: argsWithDefaults.parameterGroupName,
        allowMajorVersionUpgrade: argsWithDefaults.allowMajorVersionUpgrade,
        autoMinorVersionUpgrade: argsWithDefaults.autoMinorVersionUpgrade,
        snapshotIdentifier:
          this.encryptedSnapshotCopy?.targetDbSnapshotIdentifier,
        ...monitoringOptions,
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this, dependsOn: [this.password] },
    );
    return instance;
  }
}
