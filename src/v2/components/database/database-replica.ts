import * as aws from '@pulumi/aws-v7';
import * as awsNative from '@pulumi/aws-native';
import * as pulumi from '@pulumi/pulumi';
import { commonTags } from '../../../constants';

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
      sourceDbInstanceIdentifier: pulumi.Input<string>;
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
  enableMonitoring: false,
  allowMajorVersionUpgrade: false,
  autoMinorVersionUpgrade: true,
  engineVersion: '17.2',
};

export class DatabaseReplica extends pulumi.ComponentResource {
  name: string;
  instance: awsNative.rds.DbInstance;

  constructor(
    name: string,
    args: DatabaseReplica.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:DatabaseReplica', name, {}, opts);

    this.name = name;

    const argsWithDefaults = Object.assign({}, defaults, args);
    this.instance = this.createDatabaseInstance(argsWithDefaults);

    this.registerOutputs();
  }

  private createDatabaseInstance(args: DatabaseReplica.Args) {
    const monitoringOptions = args.monitoringRole
      ? {
          monitoringInterval: 60,
          monitoringRoleArn: args.monitoringRole.arn,
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
        vpcSecurityGroups: [args.dbSecurityGroup.id],
        dbSubnetGroupName: args.dbSubnetGroup?.name,
        allocatedStorage: args.allocatedStorage?.toString(),
        maxAllocatedStorage: args.maxAllocatedStorage,
        multiAz: args.multiAz,
        applyImmediately: args.applyImmediately,
        allowMajorVersionUpgrade: args.allowMajorVersionUpgrade,
        autoMinorVersionUpgrade: args.autoMinorVersionUpgrade,
        sourceDbInstanceIdentifier: args.sourceDbInstanceIdentifier,
        dbParameterGroupName: args.parameterGroupName,
        ...monitoringOptions,
        tags: pulumi
          .output(args.tags)
          .apply(tags => [
            ...Object.entries({ ...commonTags, ...tags }).map(
              ([key, value]) => ({ key, value }),
            ),
          ]),
      },
      { parent: this },
    );

    return instance;
  }
}
