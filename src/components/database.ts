import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { Password } from './password';
import { commonTags } from '../constants';

export type DatabaseArgs = {
  /**
   * The name of the database to create when the DB instance is created.
   */
  dbName: pulumi.Input<string>;
  /**
   * Username for the master DB user.
   */
  username: pulumi.Input<string>;
  vpcId: pulumi.Input<string>;
  isolatedSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  /**
   * The IPv4 CIDR block for the VPC.
   */
  vpcCidrBlock: pulumi.Input<string>;
  /**
   * Specifies if the RDS instance is multi-AZ. Defaults to false.
   */
  multiAz?: pulumi.Input<boolean>;
  /**
   * Password for the master DB user. If not specified it will be autogenerated.
   * The value will be stored as a secret in AWS Secret Manager.
   */
  password?: pulumi.Input<string>;
  /**
   * Specifies whether any database modifications are applied immediately,
   * or during the next maintenance window. Default is false.
   */
  applyImmediately?: pulumi.Input<boolean>;
  /**
   * Determines whether a final DB snapshot is created before the DB
   * instance is deleted. Defaults to false.
   */
  skipFinalSnapshot?: pulumi.Input<boolean>;
  /**
   * The allocated storage in gibibytes. Defaults to 20GB.
   */
  allocatedStorage?: pulumi.Input<number>;
  /**
   * The upper limit to which Amazon RDS can automatically scale
   * the storage of the DB instance. Defaults to 100GB.
   */
  maxAllocatedStorage?: pulumi.Input<number>;
  /**
   * The instance type of the RDS instance. Defaults to 'db.t4g.micro'.
   */
  instanceClass?: pulumi.Input<string>;
  /**
   * Set this to true to enable database monitoring. Defaults to false.
   */
  enableMonitoring?: pulumi.Input<boolean>;
  /**
   * ARN of the primary DB that we want to replicate. If this param is set,
   * the instance will be set up as a replica.
   * Note: if we provide this param, we need to omit dbName and username since those
   * are inherited from the replication source.
   */
  replicateSourceDb?: pulumi.Input<string>;
  /**
   * A map of tags to assign to the resource.
   */
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

const defaults = {
  multiAz: false,
  applyImmediately: false,
  skipFinalSnapshot: false,
  allocatedStorage: 20,
  maxAllocatedStorage: 100,
  instanceClass: 'db.t4g.micro',
  enableMonitoring: false,
};

export class Database extends pulumi.ComponentResource {
  name: string;
  instance: aws.rds.Instance;
  kms: aws.kms.Key;
  dbSubnetGroup: aws.rds.SubnetGroup;
  dbSecurityGroup: aws.ec2.SecurityGroup;
  password: Password;
  monitoringRole?: aws.iam.Role;

  constructor(
    name: string,
    args: DatabaseArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Database', name, {}, opts);

    this.name = name;

    const argsWithDefaults = Object.assign({}, defaults, args);
    const { vpcId, isolatedSubnetIds, vpcCidrBlock, enableMonitoring } =
      argsWithDefaults;
    this.dbSubnetGroup = this.createSubnetGroup({ isolatedSubnetIds });
    this.dbSecurityGroup = this.createSecurityGroup({ vpcId, vpcCidrBlock });
    this.kms = this.createEncryptionKey();
    this.password = new Password(
      `${this.name}-database-password`,
      { value: args.password },
      { parent: this },
    );
    if (enableMonitoring) {
      this.monitoringRole = this.createMonitoringRole();
    }
    this.instance = this.createDatabaseInstance(args);

    this.registerOutputs();
  }

  private createSubnetGroup({
    isolatedSubnetIds,
  }: Pick<DatabaseArgs, 'isolatedSubnetIds'>) {
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

  private createSecurityGroup({
    vpcId,
    vpcCidrBlock,
  }: Pick<DatabaseArgs, 'vpcId' | 'vpcCidrBlock'>) {
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

  private createDatabaseInstance(args: DatabaseArgs) {
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
        engineVersion: '15.5',
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
        autoMinorVersionUpgrade: true,
        maintenanceWindow: 'Mon:07:00-Mon:07:30',
        finalSnapshotIdentifier: `${this.name}-final-snapshot-${stack}`,
        backupWindow: '06:00-06:30',
        backupRetentionPeriod: 14,
        replicateSourceDb: argsWithDefaults.replicateSourceDb,
        ...monitoringOptions,
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this, dependsOn: [this.password] },
    );
    return instance;
  }
}
