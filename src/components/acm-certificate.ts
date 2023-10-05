import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

export type AcmCertificateArgs = {
  domain: pulumi.Input<string>;
  hostedZoneId: pulumi.Input<string>;
};

export class AcmCertificate extends pulumi.ComponentResource {
  certificate: aws.acm.Certificate;

  constructor(
    name: string,
    args: AcmCertificateArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:acm:Certificate', name, {}, opts);

    this.certificate = new aws.acm.Certificate(
      `${args.domain}-certificate`,
      { domainName: args.domain, validationMethod: 'DNS' },
      { parent: this },
    );

    const certificateValidationDomain = new aws.route53.Record(
      `${args.domain}-cert-validation-domain`,
      {
        name: this.certificate.domainValidationOptions[0].resourceRecordName,
        type: this.certificate.domainValidationOptions[0].resourceRecordType,
        zoneId: args.hostedZoneId,
        records: [
          this.certificate.domainValidationOptions[0].resourceRecordValue,
        ],
        ttl: 600,
      },
      {
        parent: this,
        deleteBeforeReplace: true,
      },
    );

    const certificateValidation = new aws.acm.CertificateValidation(
      `${args.domain}-cert-validation`,
      {
        certificateArn: this.certificate.arn,
        validationRecordFqdns: [certificateValidationDomain.fqdn],
      },
      { parent: this },
    );

    this.registerOutputs();
  }
}
