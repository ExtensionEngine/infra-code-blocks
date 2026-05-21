# `src/components/database`

The database module provides PostgreSQL infrastructure components for primary RDS instances, sequential read replicas, and optional SSM-based operator access.

Use `Database` or `DatabaseBuilder` when you want secure-by-default networking, encryption, Secrets Manager-backed credentials, optional monitoring, snapshot restore support, and an SSM access helper in one package-standard data layer.

## Usage examples

### Happy path

```ts
import * as studion from '@studion/infra-code-blocks';

const vpc = new studion.Vpc('app');

const database = new studion.DatabaseBuilder('app-db')
  .withVpc(vpc.vpc)
  .withInstance({ dbName: 'app' })
  .withCredentials({ username: 'app_user' })
  .build();

export const databaseEndpoint = database.instance.address;
export const passwordSecretArn = database.password.secret.arn;
```

### Non-trivial scenario

```ts
import * as studion from '@studion/infra-code-blocks';

const vpc = new studion.Vpc('platform');

const database = new studion.Database('platform-db', {
  vpc: vpc.vpc,
  dbName: 'platform',
  username: 'platform_user',
  enableMonitoring: true,
});

const replica = new studion.DatabaseReplica('platform-db-replica', {
  replicateSourceDb: database.instance.identifier.apply(id => id!),
  dbSecurityGroup: database.dbSecurityGroup,
  monitoringRole: database.monitoringRole,
  instanceClass: 'db.t4g.small',
});

const ssmConnect = new studion.Ec2SSMConnect('platform-db-ssm', {
  vpc: vpc.vpc,
  instanceType: 't4g.small',
});

export const primaryArn = database.instance.arn;
export const replicaArn = replica.instance.arn;
export const ssmHostId = ssmConnect.ec2.id;
```

## Implementation notes

- The primary and replica components are PostgreSQL-only (`engine: 'postgres'`).
- `Database` merges caller input with defaults of engine version `17.2`, instance class `db.t4g.micro`, `allocatedStorage: 20`, `maxAllocatedStorage: 100`, `multiAz: false`, `applyImmediately: false`, `skipFinalSnapshot: false`, `allowMajorVersionUpgrade: false`, `autoMinorVersionUpgrade: true`, and monitoring disabled.
- The primary subnet group always uses `vpc.isolatedSubnetIds`, and the database is always created with `publiclyAccessible: false`.
- The database security group allows TCP/5432 from the VPC CIDR block.
- The primary password is always managed through a nested `Password` component. If you omit `password`, that nested component generates a random password and stores it in Secrets Manager.
- `Database` creates replicas sequentially. Each replica depends on the previous primary/replica instance rather than creating all replicas in parallel to avoid race conditions over the primary instance's available state.
- If `kmsKeyId` is omitted, `Database` creates a new KMS key with key rotation enabled and uses it for storage encryption and encrypted snapshot copies.
- If `snapshotIdentifier` is provided, the component copies that snapshot with the configured KMS key and uses the copied snapshot as the primary instance source.
- Primary instances always use `storageEncrypted: true`, `backupRetentionPeriod: 14`, `backupWindow: '06:00-06:30'`, `maintenanceWindow: 'Mon:07:00-Mon:07:30'`, and `caCertIdentifier: 'rds-ca-rsa2048-g1'`.
- The primary RDS resource always receives a generated `finalSnapshotIdentifier` of `${name}-final-snapshot-${stack}`; AWS uses it only when `skipFinalSnapshot` is false.
- Replica instances are always created with `storageEncrypted: true`, `publiclyAccessible: false`, `skipFinalSnapshot: true`, and the same maintenance window as the primary.
- Enhanced monitoring and Performance Insights are enabled only when a monitoring role is available; the primary creates that role only when `enableMonitoring` is truthy.
- `Ec2SSMConnect` requires Pulumi config `aws:region` because the VPC endpoint service names are region-specific.
- `Ec2SSMConnect` always places the helper instance and all three interface endpoints in the first private subnet only, and the helper instance does not receive a public IP.
- The helper security group is attached to the EC2 instance and interface endpoints, allows TCP/22 and TCP/443 from the VPC CIDR, and allows all outbound traffic; database access relies on the database security group allowing TCP/5432 from the VPC CIDR.
- When `ami` is omitted, `Ec2SSMConnect` looks up the most recent Amazon Linux 2023 ARM64 EBS HVM AMI with ENA support and defaults the instance type to `t4g.nano`.

## API Reference

### `Database`

**Signature**

```ts
class Database extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: Database.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`Database.Args`                 | Primary database configuration object.      |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: Database.Args`

| Property                                                        | Description                                                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `vpc`\*<br/>`pulumi.Input<awsx.ec2.Vpc>`                        | Source of isolated/private subnets and VPC CIDR-based security group rules.                                                               |
| `dbName`<br/>`pulumi.Input<string>`                             | Database name for the primary instance.                                                                                                   |
| `username`<br/>`pulumi.Input<string>`                           | Master username for the primary instance.                                                                                                 |
| `password`<br/>`pulumi.Input<string>`                           | If omitted, a nested `Password` component generates and stores the secret. Default: generated by `Password`.                              |
| `engineVersion`<br/>`pulumi.Input<string>`                      | PostgreSQL engine version. Default: `'17.2'`.                                                                                             |
| `multiAz`<br/>`pulumi.Input<boolean>`                           | Multi-AZ toggle for the primary instance. Default: `false`.                                                                               |
| `instanceClass`<br/>`pulumi.Input<string>`                      | Instance type of the primary RDS instance. Default: `'db.t4g.micro'`.                                                                     |
| `allocatedStorage`<br/>`pulumi.Input<number>`                   | Initial storage in GiB. Default: `20`.                                                                                                    |
| `maxAllocatedStorage`<br/>`pulumi.Input<number>`                | Storage autoscaling ceiling in GiB. Default: `100`.                                                                                       |
| `allowMajorVersionUpgrade`<br/>`pulumi.Input<boolean>`          | Allows major engine version upgrades when changing `engineVersion`. Default: `false`.                                                     |
| `autoMinorVersionUpgrade`<br/>`pulumi.Input<boolean>`           | Enables automatic minor engine version upgrades during the maintenance window. Default: `true`.                                           |
| `applyImmediately`<br/>`pulumi.Input<boolean>`                  | Applies modifications immediately instead of waiting for the next maintenance window. Default: `false`.                                   |
| `skipFinalSnapshot`<br/>`pulumi.Input<boolean>`                 | Skips creation of a final DB snapshot when the primary instance is deleted. Default: `false`.                                             |
| `enableMonitoring`<br/>`pulumi.Input<boolean>`                  | Creates the enhanced-monitoring role and enables enhanced monitoring plus Performance Insights on the primary instance. Default: `false`. |
| `snapshotIdentifier`<br/>`pulumi.Input<string>`                 | If set, `Database` creates an encrypted snapshot copy and restores the primary instance from that copy.                                   |
| `parameterGroupName`<br/>`pulumi.Input<string>`                 | Optional DB parameter group name for the primary instance.                                                                                |
| `kmsKeyId`<br/>`pulumi.Input<string>`                           | Override for storage encryption and encrypted snapshot copies. Default: generated KMS key ARN.                                            |
| `replicaConfigs`<br/>`Map<string, Database.ReplicaConfig>`      | Ordered map of replica names to configs. Replicas are created sequentially in insertion order.                                            |
| `enableSSMConnect`<br/>`pulumi.Input<boolean>`                  | Creates the nested `Ec2SSMConnect` helper when truthy. Default: `false`.                                                                  |
| `ssmConnectConfig`<br/>`Database.SSMConnectConfig`              | Extra arguments forwarded to `Ec2SSMConnect`; only used when `enableSSMConnect` is truthy. Default: `{}`.                                 |
| `tags`<br/>`pulumi.Input<Record<string, pulumi.Input<string>>>` | Extra tags merged with the package common tags on primary resources.                                                                      |

**Outputs**

| Property                                                        | Description                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `name`<br/>`string`                                             | Component name.                                                                   |
| `instance`<br/>`aws.rds.Instance`                               | Primary PostgreSQL instance.                                                      |
| `vpc`<br/>`pulumi.Output<awsx.ec2.Vpc>`                         | VPC captured from the constructor arguments.                                      |
| `dbSubnetGroup`<br/>`aws.rds.SubnetGroup`                       | Primary subnet group built from `vpc.isolatedSubnetIds`.                          |
| `dbSecurityGroup`<br/>`aws.ec2.SecurityGroup`                   | Security group that allows PostgreSQL traffic from the VPC CIDR block.            |
| `password`<br/>`Password`                                       | Nested password helper used to supply and store the primary password.             |
| `kmsKeyId`<br/>`pulumi.Output<string>`                          | Effective KMS key ARN used for storage encryption.                                |
| `monitoringRole`<br/>`aws.iam.Role \| undefined`                | Primary-instance monitoring role when enhanced monitoring is enabled.             |
| `encryptedSnapshotCopy`<br/>`aws.rds.SnapshotCopy \| undefined` | Encrypted snapshot copy created before restore when `snapshotIdentifier` is used. |
| `replicas`<br/>`DatabaseReplica[] \| undefined`                 | Replica components created from `replicaConfigs`, in insertion order.             |
| `ec2SSMConnect`<br/>`Ec2SSMConnect \| undefined`                | Nested SSM helper component created when `enableSSMConnect` is truthy.            |

**Supporting Types**

**`Database.Instance`**

```ts
type Instance = {
  dbName?: pulumi.Input<string>;
  engineVersion?: pulumi.Input<string>;
  multiAz?: pulumi.Input<boolean>;
  instanceClass?: pulumi.Input<string>;
  allowMajorVersionUpgrade?: pulumi.Input<boolean>;
  autoMinorVersionUpgrade?: pulumi.Input<boolean>;
  applyImmediately?: pulumi.Input<boolean>;
  skipFinalSnapshot?: pulumi.Input<boolean>;
};
```

Used to isolate database instance configuration. Combined with the other types to create `Database.Args` intersection type.

**`Database.Credentials`**

```ts
type Credentials = {
  username?: pulumi.Input<string>;
  password?: pulumi.Input<string>;
};
```

Used to isolate database credentials. Combined with the other types to create `Database.Args` intersection type.

**`Database.Storage`**

```ts
type Storage = {
  allocatedStorage?: pulumi.Input<number>;
  maxAllocatedStorage?: pulumi.Input<number>;
};
```

Used to isolate database storage settings. Combined with the other types to create `Database.Args` intersection type.

**`Database.ReplicaConfig`**

```ts
type ReplicaConfig = Partial<
  Omit<
    DatabaseReplica.Args,
    'replicateSourceDb' | keyof DatabaseReplica.Security
  >
> & {
  enableMonitoring?: pulumi.Input<boolean>;
};
```

| Difference from `DatabaseReplica.Args` | Description                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Omits `replicateSourceDb`              | `Database` always wires replicas to the primary instance identifier.                                           |
| Omits `dbSecurityGroup`                | `Database` always reuses `database.dbSecurityGroup`.                                                           |
| Omits `dbSubnetGroup`                  | Replica subnet group cannot be overridden through `replicaConfigs`.                                            |
| Adds `enableMonitoring`                | When `true`, the replica uses `monitoringRole` if provided, otherwise falls back to `database.monitoringRole`. |

**`Database.SSMConnectConfig`**

```ts
type SSMConnectConfig = Omit<Ec2SSMConnect.Args, 'vpc'>;
```

| Difference from `Ec2SSMConnect.Args` | Description                                                           |
| ------------------------------------ | --------------------------------------------------------------------- |
| Omits `vpc`                          | `Database` always passes its own `vpc` to the nested `Ec2SSMConnect`. |

### `DatabaseBuilder`

**Signature**

```ts
class DatabaseBuilder {
  constructor(name: string);
}
```

**Constructor Parameters**

| Parameter             | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `name`\*<br/>`string` | Base name used when `build()` constructs the `Database`. |

**Builder Methods**

| Method               | Parameters                                                 | Description                                            |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `withInstance`       | `instanceConfig: Database.Instance = {}`                   | Stores primary instance settings.                      |
| `withCredentials`    | `credentialsConfig: Database.Credentials = {}`             | Stores username and optional password.                 |
| `withStorage`        | `storageConfig: Database.Storage = {}`                     | Stores storage sizing settings.                        |
| `withVpc`            | `vpc: Database.Args['vpc']`                                | Stores the required VPC.                               |
| `withMonitoring`     | none                                                       | Sets `enableMonitoring = true`.                        |
| `withSnapshot`       | `snapshotIdentifier: Database.Args['snapshotIdentifier']`  | Stores the snapshot identifier.                        |
| `withKms`            | `kmsKeyId: Database.Args['kmsKeyId']`                      | Stores a custom KMS key ID or ARN.                     |
| `withParameterGroup` | `parameterGroupName: Database.Args['parameterGroupName']`  | Stores a custom DB parameter group name.               |
| `withTags`           | `tags: Database.Args['tags']`                              | Stores extra tags.                                     |
| `addReplica`         | `name: string, replicaConfig: Database.ReplicaConfig = {}` | Adds one replica config to the internal ordered `Map`. |
| `withSSMConnect`     | `ssmConnectConfig: Database.Args['ssmConnectConfig'] = {}` | Enables `Ec2SSMConnect` and stores its extra config.   |
| `build`              | `opts: pulumi.ComponentResourceOptions = {}`               | Validates collected settings and returns a `Database`. |

**Build Result**

```ts
build(opts: pulumi.ComponentResourceOptions = {}): Database
```

| Return Type | Description                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Database`  | Returns a `Database` assembled from the collected builder state. Throws unless `withVpc()` has been called and replica monitoring requirements are met. |

**Supporting Types**

`DatabaseBuilder` reuses `Database.Instance`, `Database.Credentials`, `Database.Storage`, and `Database.ReplicaConfig`, documented in the [`Database`](#database) block above.

### `DatabaseReplica`

**Signature**

```ts
class DatabaseReplica extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: DatabaseReplica.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`DatabaseReplica.Args`          | Replica database configuration object.      |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: DatabaseReplica.Args`

| Property                                                        | Description                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `replicateSourceDb`\*<br/>`pulumi.Input<string>`                | Source DB identifier to replicate.                                                                              |
| `dbSecurityGroup`\*<br/>`aws.ec2.SecurityGroup`                 | Applied as the only VPC security group on the replica.                                                          |
| `dbSubnetGroup`<br/>`aws.rds.SubnetGroup`                       | Optional subnet group override.                                                                                 |
| `monitoringRole`<br/>`aws.iam.Role`                             | Enables enhanced monitoring and Performance Insights when provided.                                             |
| `parameterGroupName`<br/>`pulumi.Input<string>`                 | Replica DB parameter group.                                                                                     |
| `engineVersion`<br/>`pulumi.Input<string>`                      | PostgreSQL engine version. Default: `'17.2'`.                                                                   |
| `multiAz`<br/>`pulumi.Input<boolean>`                           | Multi-AZ toggle. Default: `false`.                                                                              |
| `instanceClass`<br/>`pulumi.Input<string>`                      | Instance type of the replica RDS instance. Default: `'db.t4g.micro'`.                                           |
| `allocatedStorage`<br/>`pulumi.Input<number>`                   | Initial storage in GiB. Default: `20`.                                                                          |
| `maxAllocatedStorage`<br/>`pulumi.Input<number>`                | Storage ceiling in GiB. Default: `100`.                                                                         |
| `applyImmediately`<br/>`pulumi.Input<boolean>`                  | Applies replica modifications immediately instead of waiting for the next maintenance window. Default: `false`. |
| `allowMajorVersionUpgrade`<br/>`pulumi.Input<boolean>`          | Allows major engine version upgrades when changing the replica `engineVersion`. Default: `false`.               |
| `autoMinorVersionUpgrade`<br/>`pulumi.Input<boolean>`           | Enables automatic minor engine version upgrades for the replica during the maintenance window. Default: `true`. |
| `tags`<br/>`pulumi.Input<Record<string, pulumi.Input<string>>>` | Extra tags merged with the package common tags.                                                                 |

**Outputs**

| Property                          | Description           |
| --------------------------------- | --------------------- |
| `name`<br/>`string`               | Component name.       |
| `instance`<br/>`aws.rds.Instance` | Replica RDS instance. |

**Supporting Types**

**`DatabaseReplica.Instance`**

```ts
type Instance = {
  engineVersion?: pulumi.Input<string>;
  multiAz?: pulumi.Input<boolean>;
  instanceClass?: pulumi.Input<string>;
  allowMajorVersionUpgrade?: pulumi.Input<boolean>;
  autoMinorVersionUpgrade?: pulumi.Input<boolean>;
  applyImmediately?: pulumi.Input<boolean>;
};
```

Used to isolate database replica instance configuration. Combined with the other types to create `DatabaseReplica.Args` intersection type.

**`DatabaseReplica.Security`**

```ts
type Security = {
  dbSecurityGroup: aws.ec2.SecurityGroup;
  dbSubnetGroup?: aws.rds.SubnetGroup;
};
```

Used to isolate database replica security settings. Combined with the other types to create `DatabaseReplica.Args` intersection type.

**`DatabaseReplica.Storage`**

```ts
type Storage = {
  allocatedStorage?: pulumi.Input<number>;
  maxAllocatedStorage?: pulumi.Input<number>;
};
```

Used to isolate database replica storage settings. Combined with the other types to create `DatabaseReplica.Args` intersection type.

### `Ec2SSMConnect`

**Signature**

```ts
class Ec2SSMConnect extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: Ec2SSMConnect.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`Ec2SSMConnect.Args`            | SSM helper instance configuration object.   |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: Ec2SSMConnect.Args`

| Property                                                        | Description                                                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vpc`\*<br/>`pulumi.Input<awsx.ec2.Vpc>`                        | Source of private subnets and VPC ID.                                                                                                               |
| `ami`<br/>`pulumi.Input<string>`                                | If omitted, the component looks up the most recent AL2023 ARM64 EBS HVM AMI with ENA support. Default: latest matching Amazon Linux 2023 ARM64 AMI. |
| `instanceType`<br/>`pulumi.Input<string>`                       | Helper EC2 instance type. Default: `'t4g.nano'`.                                                                                                    |
| `tags`<br/>`pulumi.Input<Record<string, pulumi.Input<string>>>` | Extra tags merged into the instance `Name` tag and package common tags.                                                                             |

**Outputs**

| Property                                                           | Description                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `name`<br/>`string`                                                | Component name.                                                         |
| `ec2SecurityGroup`<br/>`aws.ec2.SecurityGroup`                     | Security group attached to the helper instance and interface endpoints. |
| `role`<br/>`aws.iam.Role`                                          | EC2 role with the SSM managed policy attached.                          |
| `ssmProfile`<br/>`aws.iam.InstanceProfile`                         | Instance profile used by the helper EC2 instance.                       |
| `ssmVpcEndpoint`<br/>`aws.ec2.VpcEndpoint`                         | Interface endpoint for `com.amazonaws.<region>.ssm`.                    |
| `ec2MessagesVpcEndpoint`<br/>`aws.ec2.VpcEndpoint`                 | Interface endpoint for `com.amazonaws.<region>.ec2messages`.            |
| `ssmMessagesVpcEndpoint`<br/>`aws.ec2.VpcEndpoint`                 | Interface endpoint for `com.amazonaws.<region>.ssmmessages`.            |
| `ec2`<br/>`aws.ec2.Instance`                                       | Private helper EC2 instance.                                            |
| `amiResult`<br/>`pulumi.Output<aws.ec2.GetAmiResult> \| undefined` | AMI lookup result when `ami` is not supplied.                           |
