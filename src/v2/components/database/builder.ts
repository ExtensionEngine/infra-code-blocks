import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { Database } from '.';

export namespace DatabaseBuilder {
  export type Config = Omit<
    Database.Args,
    'vpc' | 'enableMonitoring' | 'kmsKeyId' | 'snapshotIdentifier'
  >;
}

export class DatabaseBuilder {
  private name: string;
  private config?: DatabaseBuilder.Config;
  private vpc?: Database.Args['vpc'];
  private enableMonitoring?: Database.Args['enableMonitoring'];
  private kmsKeyId?: Database.Args['kmsKeyId'];
  private snapshotIdentifier?: Database.Args['snapshotIdentifier'];

  constructor(name: string) {
    this.name = name;
  }

  public withConfiguration(config: DatabaseBuilder.Config = {}): this {
    this.config = config;

    return this;
  }

  public withVpc(vpc: pulumi.Input<awsx.ec2.Vpc>): this {
    this.vpc = pulumi.output(vpc);

    return this;
  }

  public withMonitoring(): this {
    this.enableMonitoring = true;

    return this;
  }

  public withSnapshot(snapshotIdentifier: pulumi.Input<string>): this {
    this.snapshotIdentifier = snapshotIdentifier;

    return this;
  }

  public withKms(kmsKeyId: pulumi.Input<string>): this {
    this.kmsKeyId = kmsKeyId;

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Database {
    if (!this.config) {
      throw new Error(
        `Database is not configured. Make sure to call DatabaseBuilder.withConfiguration().`,
      );
    }

    if (!this.vpc) {
      throw new Error(
        'VPC not provided. Make sure to call DatabaseBuilder.withVpc().',
      );
    }

    if (
      this.snapshotIdentifier &&
      (this.config.dbName || this.config.username)
    ) {
      throw new Error(
        `You can't set dbName or username when using snapshotIdentifier.`,
      );
    }

    return new Database(
      this.name,
      {
        ...this.config,
        vpc: this.vpc,
        enableMonitoring: this.enableMonitoring,
        snapshotIdentifier: this.snapshotIdentifier,
        kmsKeyId: this.kmsKeyId,
      },
      opts,
    );
  }
}
