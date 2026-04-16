# `src/components/password`

`Password` stores a password in AWS Secrets Manager, either from a caller-provided secret value or a generated `@pulumi/random` password.

Use it when higher-level components need consistent Secrets Manager-backed credential handling instead of plaintext values.

## Usage examples

### Happy path

```ts
import { Password } from '@studion/infra-code-blocks';

const password = new Password('db-password');

export const secretArn = password.secret.arn;
```

### Non-trivial scenario

```ts
import * as pulumi from '@pulumi/pulumi';
import { Password } from '@studion/infra-code-blocks';

const config = new pulumi.Config();

const password = new Password('db-password', {
  value: config.requireSecret('databasePassword'),
});

export const secretName = password.secret.name;
```

## Implementation notes

- When `args.value` is provided, the component wraps that value with `pulumi.secret(...)` before exposing it on `password.value`.
- When `args.value` is omitted, the component creates `random.RandomPassword` with `length: 16`, `special: true`, and `overrideSpecial: '_$'`.
- The generated Secrets Manager secret uses `namePrefix: ${stack}/${project}/${name}-`, so AWS chooses the final suffix.
- The Secrets Manager `Secret` is exposed as `password.secret` for callers that need its ARN, name, or other metadata.
- The password value is stored in a single `aws.secretsmanager.SecretVersion` as `secretString`; that `SecretVersion` is created internally and is not exposed as a component property.
- Rotation, password policy customization, and KMS customization are not part of implementation.

## API Reference

### `Password`

**Signature**

```ts
class Password extends pulumi.ComponentResource {
  constructor(
    name: string,
    args?: Password.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                          |
| -------------------------------------------- | ---------------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.                       |
| `args`<br/>`Password.Args`                   | Optional direct password args object. Default: `{}`. |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options.          |

**Configuration Options**

Direct constructor input: `args?: Password.Args`

| Property                           | Description                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `value`<br/>`pulumi.Input<string>` | Explicit password value to store in Secrets Manager. Default: generated random password. |

**Outputs**

| Property                                 | Description                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `name`<br/>`string`                      | Component name passed to the constructor.                                                                     |
| `value`<br/>`pulumi.Output<string>`      | Primary consumed secret output containing the stored password value.                                          |
| `secret`<br/>`aws.secretsmanager.Secret` | Underlying AWS Secrets Manager secret for integrations that need the secret ARN, name, or other AWS metadata. |
