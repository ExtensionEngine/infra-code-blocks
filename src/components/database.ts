import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
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
  /**
   * Password for the master DB user.
   * The value will be stored as a secret in AWS Secret Manager.
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
  /**
   * A map of tags to assign to the resource.
   */
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

const defaults = {
  applyImmediately: false,
  skipFinalSnapshot: false,
  allocatedStorage: 20,
  maxAllocatedStorage: 100,
  instanceClass: 'db.t4g.micro',
};

export class Database extends pulumi.ComponentResource {
  name: string;
  instance: aws.rds.Instance;
  kms: aws.kms.Key;
  dbSubnetGroup: aws.rds.SubnetGroup;
  dbSecurityGroup: aws.ec2.SecurityGroup;
  passwordSecret: aws.secretsmanager.Secret;

  constructor(
    name: string,
    args: DatabaseArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Database', name, {}, opts);

    this.name = name;

    const { vpc, password } = args;
    this.dbSubnetGroup = this.createSubnetGroup({ vpc });
    this.dbSecurityGroup = this.createSecurityGroup({ vpc });
    this.kms = this.createEncryptionKey();
    this.passwordSecret = this.createPasswordSecret({ password });
    this.instance = this.createDatabaseInstance(args);

    this.registerOutputs();
  }

  private createSubnetGroup({ vpc }: Pick<DatabaseArgs, 'vpc'>) {
    const dbSubnetGroup = new aws.rds.SubnetGroup(
      `${this.name}-subnet-group`,
      {
        subnetIds: vpc.isolatedSubnetIds,
        tags: commonTags,
      },
      { parent: this },
    );
    return dbSubnetGroup;
  }

  private createSecurityGroup({ vpc }: Pick<DatabaseArgs, 'vpc'>) {
    const dbSecurityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId: vpc.vpcId,
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 5432,
            toPort: 5432,
            cidrBlocks: [vpc.vpc.cidrBlock],
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

  private createPasswordSecret({ password }: Pick<DatabaseArgs, 'password'>) {
    const project = pulumi.getProject();
    const stack = pulumi.getStack();

    const passwordSecret = new aws.secretsmanager.Secret(
      `${this.name}-password-secret`,
      {
        namePrefix: `${stack}/${project}/DatabasePassword-`,
        tags: commonTags,
      },
      { parent: this },
    );

    const passwordSecretValue = new aws.secretsmanager.SecretVersion(
      `${this.name}-password-secret-value`,
      {
        secretId: passwordSecret.id,
        secretString: password,
      },
      { parent: this, dependsOn: [passwordSecret] },
    );

    return passwordSecret;
  }

  private createDatabaseInstance(args: DatabaseArgs) {
    const argsWithDefaults = Object.assign({}, defaults, args);
    const stack = pulumi.getStack();
    const instance = new aws.rds.Instance(
      `${this.name}-rds`,
      {
        identifierPrefix: `${this.name}-`,
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
        finalSnapshotIdentifier: `${this.name}-final-snapshot-${stack}`,
        backupWindow: '06:00-06:30',
        backupRetentionPeriod: 14,
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this },
    );
    return instance;
  }
}
