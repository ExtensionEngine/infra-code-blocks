# `src/components/acm-certificate`

`AcmCertificate` provisions ACM certificates with Route53 DNS validation, including optional SANs and region overrides.

Use it when a stack or delivery component needs certificate issuance and DNS validation handled together instead of managing ACM and Route53 resources manually.

## Usage examples

### Happy path

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const hostedZone = aws.route53.getZoneOutput({
  name: 'example.com',
  privateZone: false,
});

const certificate = new studion.AcmCertificate('app-cert', {
  domain: 'app.example.com',
  hostedZoneId: hostedZone.zoneId,
});

export const certificateArn = certificate.certificate.arn;
```

### Non-trivial scenario

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const hostedZone = aws.route53.getZoneOutput({
  name: 'example.com',
  privateZone: false,
});

const certificate = new studion.AcmCertificate('cdn-cert', {
  domain: 'docs.example.com',
  subjectAlternativeNames: ['www.docs.example.com'],
  hostedZoneId: hostedZone.zoneId,
  region: 'us-east-1',
});

export const validationStatus =
  certificate.certificateValidation.certificateArn;
```

## Implementation notes

- Validation method is DNS-only.
- Validation records are created for every ACM `domainValidationOptions` entry, including entries produced for subject alternative names.
- Validation records are always created in Route53 using the provided `hostedZoneId`.
- Validation Route53 records are created with `ttl: 600` and `deleteBeforeReplace: true`.
- The optional `region` argument is passed to both `aws.acm.Certificate` and `aws.acm.CertificateValidation`; it does not change the Route53 validation record region.
- The ACM certificate and validation child resource names are derived from `domain`, and validation-record names are derived from each ACM validation domain. Changing certificate domains can therefore change Pulumi child URNs in addition to the AWS certificate inputs.
- The component does not expose validation record TTL or validation record naming as configuration.
- If you need a CloudFront certificate, you must pass `region: 'us-east-1'` yourself or use a higher-level component that does it for you.

## API Reference

### `AcmCertificate`

**Signature**

```ts
class AcmCertificate extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: AcmCertificate.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`AcmCertificate.Args`           | Direct certificate configuration object.    |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: AcmCertificate.Args`

| Property                                               | Description                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `domain`\*<br/>`pulumi.Input<string>`                  | Primary certificate domain passed to `aws.acm.Certificate.domainName`.                                          |
| `subjectAlternativeNames`<br/>`pulumi.Input<string>[]` | Additional DNS names passed to `aws.acm.Certificate.subjectAlternativeNames`.                                   |
| `hostedZoneId`\*<br/>`pulumi.Input<string>`            | Route53 hosted zone that receives every generated validation record.                                            |
| `region`<br/>`pulumi.Input<string>`                    | ACM region override. Set this to `us-east-1` for CloudFront-compatible certificates. Default: provider default. |

**Outputs**

| Property                                                                   | Description                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `certificate`<br/>`aws.acm.Certificate`                                    | Requested ACM certificate resource; use this as the primary certificate output.             |
| `certificateValidation`<br/>`pulumi.Output<aws.acm.CertificateValidation>` | Validation resource that resolves only after all generated DNS validation records are used. |
