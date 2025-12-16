import { Database } from '.';
import * as pulumi from '@pulumi/pulumi';

export namespace DatabaseBuilder {
  export type InstanceConfig = Database.Instance;
  export type CredentialsConfig = Database.Credentials;
  export type StorageConfig = Omit<Database.Storage, 'kmsKeyId'>;
}

export class DatabaseBuilder {
  private name: string;
  private instanceConfig?: DatabaseBuilder.InstanceConfig;
  private credentialsConfig?: DatabaseBuilder.CredentialsConfig;
  private storageConfig?: DatabaseBuilder.StorageConfig;
  private vpc?: Database.Args['vpc'];
  private enableMonitoring?: Database.Args['enableMonitoring'];
  private snapshotIdentifier?: Database.Args['snapshotIdentifier'];
  private kmsKeyId?: Database.Args['kmsKeyId'];
  private parameterGroupName?: Database.Args['parameterGroupName'];
  private tags?: Database.Args['tags'];

  constructor(name: string) {
    this.name = name;
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

  public withKms(kmsKeyId: Database.Args['kmsKeyId']): this {
    this.kmsKeyId = kmsKeyId;

    return this;
  }

  public withParameterGroup(
    parameterGroupName: Database.Args['parameterGroupName'],
  ): this {
    this.parameterGroupName = parameterGroupName;

    return this;
  }

  public withTags(tags: Database.Args['tags']): this {
    this.tags = tags;

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

    if (this.snapshotIdentifier && this.instanceConfig?.dbName) {
      throw new Error(`You can't set dbName when using snapshotIdentifier.`);
    }

    if (this.snapshotIdentifier && this.credentialsConfig?.username) {
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
        ...this.instanceConfig,
        ...this.credentialsConfig,
        ...this.storageConfig,
        vpc: this.vpc,
        enableMonitoring: this.enableMonitoring,
        snapshotIdentifier: this.snapshotIdentifier,
        kmsKeyId: this.kmsKeyId,
        parameterGroupName: this.parameterGroupName,
        tags: this.tags,
      },
      opts,
    );
  }
}
