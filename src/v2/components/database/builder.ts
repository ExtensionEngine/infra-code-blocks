import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { Database } from '.';

export namespace DatabaseBuilder {
  export type Config = Omit<
    Database.Args,
    'vpc' | 'enableMonitoring' | 'customParameterGroupArgs' | 'kms' | 'snapshotIdentifier'
  >;
}

export class DatabaseBuilder {
  private _name: string;
  private _config?: DatabaseBuilder.Config;
  private _vpc?: Database.Args['vpc'];
  private _enableMonitoring?: Database.Args['enableMonitoring'];
  private _customParameterGroupArgs?: Database.Args['customParameterGroupArgs'];
  private _kms?: Database.Args['kms'];
  private _snapshotIdentifier?: Database.Args['snapshotIdentifier'];

  constructor(name: string) {
    this._name = name;
  }

  public configure(
    dbName: DatabaseBuilder.Config['dbName'],
    username: DatabaseBuilder.Config['username'],
    config: Omit<DatabaseBuilder.Config, 'dbName' | 'username'> = {},
  ): this {
    this._config = {
      dbName,
      username,
      ...config,
    };

    return this;
  }

  public createFromSnapshot(snapshotIdentifier: string): this {
    this._snapshotIdentifier = snapshotIdentifier;

    return this;
  }

  public withVpc(vpc: pulumi.Input<awsx.ec2.Vpc>): this {
    this._vpc = pulumi.output(vpc);

    return this;
  }

  public withMonitoring(): this {
    this._enableMonitoring = true;

    return this;
  }

  public withCustomParameterGroup(
    customParameterGroupArgs: pulumi.Input<aws.rds.ParameterGroupArgs>,
  ): this {
    this._customParameterGroupArgs = customParameterGroupArgs;

    return this;
  }

  public withCustomKms(kms: aws.kms.Key): this {
    this._kms = kms;

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Database {
    if (!this._config && !this._snapshotIdentifier) {
      throw new Error(
        `Database is not configured. Make sure to call DatabaseBuilder.configure()
        or create it from a snapshot with DatabaseBuilder.createFromSnapshot().`,
      );
    }

    if (!this._vpc) {
      throw new Error(
        'VPC not provided. Make sure to call DatabaseBuilder.withVpc().',
      );
    }

    if (this._customParameterGroupArgs && this._config?.parameterGroupName) {
      console.warn(
        `You provided both customParameterGroupArgs and parameterGroupName,
        so the latter will be ignored.`,
      );
    }

    return new Database(
      this._name,
      {
        ...this._config,
        vpc: this._vpc,
        enableMonitoring: this._enableMonitoring,
        customParameterGroupArgs: this._customParameterGroupArgs,
        kms: this._kms,
        snapshotIdentifier: this._snapshotIdentifier,
      },
      opts,
    );
  }
}
