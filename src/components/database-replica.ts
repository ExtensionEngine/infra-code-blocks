import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { commonTags } from '../constants';

export type DatabaseReplicaArgs = {
  /**
   * ARN of the primary DB that we want to replicate.
   */
  replicateSourceDb: pulumi.Input<string>;
  /**
   * DB subnet group name. Should be the same as primary instance.
   * * If primary DB is instance of studion:Database, it can be accessed as
   * `db.dbSubnetGroup.name`.
   */
  dbSubnetGroupName?: pulumi.Input<string>;
  /**
   * DB security group ID. Should be the same as primary instance.
   * If primary DB is instance of studion:Database, it can be accessed as
   * `db.dbSecurityGroup.id`.
   */
  dbSecurityGroupId: pulumi.Input<string>;
  /**
   * IAM Monitoring role. Should be the same as primary instance.
   */
  monitoringRole?: aws.iam.Role;
  /**
   * Specifies if the RDS instance is multi-AZ. Defaults to false.
   */
  multiAz?: pulumi.Input<boolean>;
  /**
   * Specifies whether any database modifications are applied immediately,
   * or during the next maintenance window. Default is false.
   */
  applyImmediately?: pulumi.Input<boolean>;
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
   * The name of custom aws.rds.ParameterGroup. Setting this param will apply custom
   * DB parameters to this instance.
   */
  parameterGroupName?: pulumi.Input<string>;
  /**
   * The DB engine version. Defaults to '17.2'.
   */
  engineVersion?: pulumi.Input<string>;
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
  allocatedStorage: 20,
  maxAllocatedStorage: 100,
  instanceClass: 'db.t4g.micro',
  enableMonitoring: false,
  engineVersion: '17.2',
};

export class DatabaseReplica extends pulumi.ComponentResource {
  name: string;
  instance: aws.rds.Instance;
  monitoringRole?: aws.iam.Role;

  constructor(
    name: string,
    args: DatabaseReplicaArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:DatabaseReplica', name, {}, opts);

    this.name = name;

    const argsWithDefaults = Object.assign({}, defaults, args);
    this.monitoringRole = argsWithDefaults.monitoringRole;
    this.instance = this.createDatabaseInstance(args);

    this.registerOutputs();
  }

  private createDatabaseInstance(args: DatabaseReplicaArgs) {
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
        dbSubnetGroupName: argsWithDefaults.dbSubnetGroupName,
        vpcSecurityGroupIds: [argsWithDefaults.dbSecurityGroupId],
        storageEncrypted: true,
        multiAz: argsWithDefaults.multiAz,
        publiclyAccessible: false,
        applyImmediately: argsWithDefaults.applyImmediately,
        autoMinorVersionUpgrade: true,
        maintenanceWindow: 'Mon:07:00-Mon:07:30',
        replicateSourceDb: argsWithDefaults.replicateSourceDb,
        parameterGroupName: argsWithDefaults.parameterGroupName,
        skipFinalSnapshot: true,
        ...monitoringOptions,
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this }
    );
    return instance;
  }
}
