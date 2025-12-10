import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { Database } from '.';

export namespace DatabaseBuilder {
  export type InstanceConfig = Database.Instance;
  export type CredentialsConfig = Database.Credentials;
  export type StorageConfig = Database.Storage;
  export type Config = Omit<
    Database.Args,
    | keyof Database.Instance
    | keyof Database.Credentials
    | keyof Database.Storage
    | 'vpc'
    | 'enableMonitoring'
    | 'snapshotIdentifier'
  >;
}

export class DatabaseBuilder {
  private name: string;
  private config?: DatabaseBuilder.Config;
  private instanceConfig?: DatabaseBuilder.InstanceConfig;
  private credentialsConfig?: DatabaseBuilder.CredentialsConfig;
  private storageConfig?: DatabaseBuilder.StorageConfig;
  private vpc?: Database.Args['vpc'];
  private enableMonitoring?: Database.Args['enableMonitoring'];
  private snapshotIdentifier?: Database.Args['snapshotIdentifier'];

  constructor(name: string) {
    this.name = name;
  }

  public withConfiguration(config: DatabaseBuilder.Config = {}): this {
    this.config = config;

    return this;
  }

  public withInstance(
    instanceConfig: DatabaseBuilder.InstanceConfig = {},
  ): this {
    this.instanceConfig = instanceConfig;

    return this;
  }

  public withCredentials(
    credentialsConfig: DatabaseBuilder.CredentialsConfig = {},
  ): this {
    this.credentialsConfig = credentialsConfig;

    return this;
  }

  public withStorage(storageConfig: DatabaseBuilder.StorageConfig = {}): this {
    this.storageConfig = storageConfig;

    return this;
  }

  public withVpc(vpc: Database.Args['vpc']): this {
    this.vpc = pulumi.output(vpc);

    return this;
  }

  public withMonitoring(): this {
    this.enableMonitoring = true;

    return this;
  }

  public withSnapshot(
    snapshotIdentifier: Database.Args['snapshotIdentifier'],
  ): this {
    this.snapshotIdentifier = snapshotIdentifier;

    return this;
  }

  public build(opts: pulumi.ComponentResourceOptions = {}): Database {
    if (!this.snapshotIdentifier && !this.instanceConfig?.dbName) {
      throw new Error(
        'DbName not provided. Make sure to call DatabaseBuilder.withInstance() and set dbName.',
      );
    }

    if (!this.snapshotIdentifier && !this.credentialsConfig?.username) {
      throw new Error(
        'Username not provided. Make sure to call DatabaseBuilder.withCredentials() and set username.',
      );
    }

    if (this.snapshotIdentifier && !this.instanceConfig?.dbName) {
      throw new Error(`You can't set dbName when using snapshotIdentifier.`);
    }

    if (this.snapshotIdentifier && !this.credentialsConfig?.username) {
      throw new Error(`You can't set username when using snapshotIdentifier.`);
    }

    if (!this.vpc) {
      throw new Error(
        'VPC not provided. Make sure to call DatabaseBuilder.withVpc().',
      );
    }

    return new Database(
      this.name,
      {
        ...this.config,
        ...this.instanceConfig,
        ...this.credentialsConfig,
        ...this.storageConfig,
        vpc: this.vpc,
        enableMonitoring: this.enableMonitoring,
        snapshotIdentifier: this.snapshotIdentifier,
      },
      opts,
    );
  }
}
