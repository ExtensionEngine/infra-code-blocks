
import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import { Database } from '.';

export namespace DatabaseBuilder {
  export type Args = Pick<Database.Args, 'dbName' | 'username' | 'password'>;

  export type Config = Omit<Database.Args, keyof Args | 'vpc'>;
}

export class DatabaseBuilder {
  private _name: string;
  private _args?: DatabaseBuilder.Args;
  private _config?: DatabaseBuilder.Config;
  private _vpc?: pulumi.Output<awsx.ec2.Vpc>;
  private _enableMonitoring?: pulumi.Input<boolean>;
  private _snapshotIdentifier?: pulumi.Input<string>;
  
  constructor(name: string) {
    this._name = name;
  }

  public create(args: DatabaseBuilder.Args): this {
    this._args = args;

    return this;
  }

  public configure(config: DatabaseBuilder.Config): this {
    this._config = config;

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

  public withSnapshot(snapshotIdentifier: pulumi.Input<string>): this {
    this._snapshotIdentifier = snapshotIdentifier;
    
    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Database {
    if (!this._args) {
      throw new Error(
        'Database args not provided. Make sure to call DatabaseBuilder.create().',
      );
    }

    if (!this._vpc) {
      throw new Error(
        'VPC not provided. Make sure to call DatabaseBuilder.withVpc().',
      );
    }


    return new Database(
      this._name,
      {
        ...this._args,
        ...this._config,
        vpc: this._vpc,
        enableMonitoring: this._enableMonitoring,
        snapshotIdentifier: this._snapshotIdentifier,
      },
      opts,
    );
  }

}
