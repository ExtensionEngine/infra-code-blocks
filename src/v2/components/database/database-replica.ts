import * as aws from '@pulumi/aws-v7';
import * as pulumi from '@pulumi/pulumi';
import { commonTags } from '../../../constants';
import { mergeWithDefaults } from '../../shared/merge-with-defaults';

export namespace DatabaseReplica {
  export type Instance = {
    engineVersion?: pulumi.Input<string>;
    multiAz?: pulumi.Input<boolean>;
    instanceClass?: pulumi.Input<string>;
    allowMajorVersionUpgrade?: pulumi.Input<boolean>;
    autoMinorVersionUpgrade?: pulumi.Input<boolean>;
    applyImmediately?: pulumi.Input<boolean>;
  };

  export type Security = {
    dbSecurityGroup: aws.ec2.SecurityGroup;
    dbSubnetGroup?: aws.rds.SubnetGroup;
  };

  export type Storage = {
    allocatedStorage?: pulumi.Input<number>;
    maxAllocatedStorage?: pulumi.Input<number>;
  };

  export type Args = Instance &
    Security &
    Storage & {
      replicateSourceDb: pulumi.Input<string>;
      monitoringRole?: aws.iam.Role;
      parameterGroupName?: pulumi.Input<string>;
      tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
      }>;
    };
}

const defaults = {
  multiAz: false,
  applyImmediately: false,
  allocatedStorage: 20,
  maxAllocatedStorage: 100,
  instanceClass: 'db.t4g.micro',
  allowMajorVersionUpgrade: false,
  autoMinorVersionUpgrade: true,
  engineVersion: '17.2',
};

export class DatabaseReplica extends pulumi.ComponentResource {
  name: string;
  instance: aws.rds.Instance;

  constructor(
    name: string,
    args: DatabaseReplica.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:DatabaseReplica', name, {}, opts);

    this.name = name;

    this.instance = this.createDatabaseInstance(args, opts);

    this.registerOutputs();
  }

  private createDatabaseInstance(
    args: DatabaseReplica.Args,
    opts: pulumi.ComponentResourceOptions,
  ) {
    const argsWithDefaults = mergeWithDefaults(defaults, args);

    const monitoringOptions = argsWithDefaults.monitoringRole
      ? {
          monitoringInterval: 60,
          monitoringRoleArn: argsWithDefaults.monitoringRole.arn,
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
        vpcSecurityGroupIds: [argsWithDefaults.dbSecurityGroup.id],
        dbSubnetGroupName: argsWithDefaults.dbSubnetGroup?.name,
        multiAz: argsWithDefaults.multiAz,
        applyImmediately: argsWithDefaults.applyImmediately,
        allowMajorVersionUpgrade: argsWithDefaults.allowMajorVersionUpgrade,
        autoMinorVersionUpgrade: argsWithDefaults.autoMinorVersionUpgrade,
        replicateSourceDb: argsWithDefaults.replicateSourceDb,
        parameterGroupName: argsWithDefaults.parameterGroupName,
        storageEncrypted: true,
        publiclyAccessible: false,
        skipFinalSnapshot: true,
        ...monitoringOptions,
        tags: { ...commonTags, ...argsWithDefaults.tags },
      },
      { parent: this, dependsOn: opts.dependsOn },
    );

    return instance;
  }
}
