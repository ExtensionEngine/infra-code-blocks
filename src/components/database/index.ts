import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import { commonTags } from '../../shared/common-tags';
import { DatabaseReplica } from './database-replica';
import { Ec2SSMConnect } from './ec2-ssm-connect';
import { mergeWithDefaults } from '../../shared/merge-with-defaults';
import { Password } from '../password';

export namespace Database {
  export type Instance = {
    dbName?: pulumi.Input<string>;
    engineVersion?: pulumi.Input<string>;
    multiAz?: pulumi.Input<boolean>;
    instanceClass?: pulumi.Input<string>;
    allowMajorVersionUpgrade?: pulumi.Input<boolean>;
    autoMinorVersionUpgrade?: pulumi.Input<boolean>;
    applyImmediately?: pulumi.Input<boolean>;
    skipFinalSnapshot?: pulumi.Input<boolean>;
  };

  export type Credentials = {
    username?: pulumi.Input<string>;
    password?: pulumi.Input<string>;
  };

  export type Storage = {
    allocatedStorage?: pulumi.Input<number>;
    maxAllocatedStorage?: pulumi.Input<number>;
  };

  export type ReplicaConfig = Partial<
    Omit<
      DatabaseReplica.Args,
      'replicateSourceDb' | keyof DatabaseReplica.Security
    >
  > & {
    /*
     * Enables monitoring for the replica instance and
     * reuses the same monitoring role from the primary instance
     * if you don't provide a custom `monitoringRole`.
     */
    enableMonitoring?: pulumi.Input<boolean>;
  };

  export type SSMConnectConfig = Omit<Ec2SSMConnect.Args, 'vpc'>;

  export type Args = Instance &
    Credentials &
    Storage & {
      vpc: pulumi.Input<awsx.ec2.Vpc>;
      enableMonitoring?: pulumi.Input<boolean>;
      snapshotIdentifier?: pulumi.Input<string>;
      parameterGroupName?: pulumi.Input<string>;
      kmsKeyId?: pulumi.Input<string>;
      createReplica?: pulumi.Input<boolean>;
      replicaConfig?: ReplicaConfig;
      enableSSMConnect?: pulumi.Input<boolean>;
      ssmConnectConfig?: SSMConnectConfig;
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
  vpc: pulumi.Output<awsx.ec2.Vpc>;
  dbSubnetGroup: aws.rds.SubnetGroup;
  dbSecurityGroup: aws.ec2.SecurityGroup;
  password: Password;
  kmsKeyId: pulumi.Output<string>;
  monitoringRole?: aws.iam.Role;
  encryptedSnapshotCopy?: aws.rds.SnapshotCopy;
  replica?: DatabaseReplica;
  ec2SSMConnect?: Ec2SSMConnect;

  constructor(
    name: string,
    args: Database.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super(
      'studion:database:Database',
      name,
      {},
      {
        ...opts,
        aliases: [...(opts.aliases || []), { type: 'studion:Database' }],
      },
    );

    this.name = name;

    const argsWithDefaults = mergeWithDefaults(defaults, args);
    const {
      vpc,
      kmsKeyId,
      enableMonitoring,
      snapshotIdentifier,
      createReplica,
      replicaConfig = {},
      enableSSMConnect,
      ssmConnectConfig = {},
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

    if (createReplica) {
      this.replica = this.createDatabaseReplica(replicaConfig);
    }

    if (enableSSMConnect) {
      this.ec2SSMConnect = this.createEc2SSMConnect(ssmConnectConfig);
    }

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
    const monitoringRole = new aws.iam.Role(
      `${this.name}-rds-monitoring`,
      {
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
    snapshotIdentifier: Database.Args['snapshotIdentifier'],
  ) {
    const sourceDbSnapshotIdentifier = pulumi
      .output(snapshotIdentifier)
      .apply(snapshotIdentifier =>
        aws.rds.getSnapshot({
          dbSnapshotIdentifier: snapshotIdentifier,
        }),
      ).dbSnapshotArn;

    return new aws.rds.SnapshotCopy(
      `${this.name}-encrypted-snapshot-copy`,
      {
        sourceDbSnapshotIdentifier,
        targetDbSnapshotIdentifier: pulumi.interpolate`${snapshotIdentifier}-encrypted-copy`,
        kmsKeyId: this.kmsKeyId,
      },
      { parent: this },
    );
  }

  private createDatabaseReplica(config: Database.Args['replicaConfig'] = {}) {
    const monitoringRole = config.enableMonitoring
      ? config.monitoringRole || this.monitoringRole
      : undefined;

    const replica = new DatabaseReplica(
      `${this.name}-replica`,
      {
        replicateSourceDb: this.instance.dbInstanceIdentifier.apply(id => id!),
        dbSecurityGroup: this.dbSecurityGroup,
        monitoringRole,
        ...config,
      },
      { parent: this, dependsOn: [this.instance] },
    );

    return replica;
  }

  private createEc2SSMConnect(config: Database.Args['ssmConnectConfig'] = {}) {
    return new Ec2SSMConnect(
      `${this.name}-ssm-connect`,
      {
        vpc: this.vpc,
        ...config,
      },
      { parent: this },
    );
  }

  private createDatabaseInstance(args: Database.Args) {
    const stack = pulumi.getStack();

    const monitoringOptions =
      args.enableMonitoring && this.monitoringRole
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
        engineVersion: args.engineVersion,
        instanceClass: args.instanceClass!,
        dbName: args.dbName,
        username: args.username,
        password: this.password.value,
        dbSubnetGroupName: this.dbSubnetGroup.name,
        vpcSecurityGroupIds: [this.dbSecurityGroup.id],
        allocatedStorage: args.allocatedStorage,
        maxAllocatedStorage: args.maxAllocatedStorage,
        multiAz: args.multiAz,
        applyImmediately: args.applyImmediately,
        allowMajorVersionUpgrade: args.allowMajorVersionUpgrade,
        autoMinorVersionUpgrade: args.autoMinorVersionUpgrade,
        kmsKeyId: this.kmsKeyId,
        storageEncrypted: true,
        publiclyAccessible: false,
        skipFinalSnapshot: args.skipFinalSnapshot,
        maintenanceWindow: 'Mon:07:00-Mon:07:30',
        finalSnapshotIdentifier: `${this.name}-final-snapshot-${stack}`,
        backupWindow: '06:00-06:30',
        backupRetentionPeriod: 14,
        caCertIdentifier: 'rds-ca-rsa2048-g1',
        parameterGroupName: args.parameterGroupName,
        snapshotIdentifier:
          this.encryptedSnapshotCopy?.targetDbSnapshotIdentifier,
        ...monitoringOptions,
        tags: { ...commonTags, ...args.tags },
      },
      { parent: this, dependsOn: [this.password] },
    );
    return instance;
  }
}
