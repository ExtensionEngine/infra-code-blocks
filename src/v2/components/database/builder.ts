
import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';
import { Database } from '.';

export namespace DatabaseBuilder {
  export type Args = Database.Args;

  export type Config = Omit<Args, 'vpc'>;
}

export class DatabaseBuilder {
  private _name: string;
  private _config?: DatabaseBuilder.Config;
  private _vpc?: pulumi.Output<awsx.ec2.Vpc>;
  
  constructor(name: string) {
    this._name = name;
  }

  public configure(config: DatabaseBuilder.Config): this {
    this._config = config;

    return this;
  }

  public withVpc(vpc: pulumi.Input<awsx.ec2.Vpc>): this {
    this._vpc = pulumi.output(vpc);
    
    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Database {
    if (!this._config) {
      throw new Error(
        'Database not configured. Make sure to call DatabaseBuilder.configure().',
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
        ...this._config,
        vpc: this._vpc,
      },
      opts,
    );
  }

}
