import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import { commonTags } from '../../shared/common-tags';

export namespace Password {
  export type Args = {
    value?: pulumi.Input<string>;
  };
}

export class Password extends pulumi.ComponentResource {
  name: string;
  value: pulumi.Output<string>;
  secret: aws.secretsmanager.Secret;

  constructor(
    name: string,
    args: Password.Args = {},
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super(
      'studion:password:Password',
      name,
      {},
      {
        ...opts,
        aliases: [...(opts.aliases || []), { type: 'studion:Password' }],
      },
    );

    this.name = name;
    if (args.value) {
      this.value = pulumi.secret(args.value);
    } else {
      const password = new random.RandomPassword(
        `${this.name}-random-password`,
        {
          length: 16,
          overrideSpecial: '_$',
          special: true,
        },
        { parent: this },
      );
      this.value = password.result;
    }

    this.secret = this.createPasswordSecret(this.value);
    this.registerOutputs();
  }

  private createPasswordSecret(password: pulumi.Input<string>) {
    const project = pulumi.getProject();
    const stack = pulumi.getStack();

    const passwordSecret = new aws.secretsmanager.Secret(
      `${this.name}-password-secret`,
      {
        namePrefix: `${stack}/${project}/${this.name}-`,
        tags: commonTags,
      },
      { parent: this },
    );

    const passwordSecretValue = new aws.secretsmanager.SecretVersion(
      `${this.name}-password-secret-value`,
      {
        secretId: passwordSecret.id,
        secretString: password,
      },
      { parent: this, dependsOn: [passwordSecret] },
    );

    return passwordSecret;
  }
}
