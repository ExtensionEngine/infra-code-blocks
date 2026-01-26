import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws-v7';
import { commonTags } from '../../../constants';

export namespace AcmCertificate {
  export type Args = {
    domain: pulumi.Input<string>;
    /**
     * Additional domains/subdomains to be included in this certificate.
     */
    subjectAlternativeNames?: pulumi.Input<string>[];
    hostedZoneId: pulumi.Input<string>;
    region?: pulumi.Input<string>;
  };
}

export class AcmCertificate extends pulumi.ComponentResource {
  certificate: aws.acm.Certificate;
  certificateValidation: pulumi.Output<aws.acm.CertificateValidation>;

  constructor(
    name: string,
    args: AcmCertificate.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:acm:Certificate', name, {}, opts);

    this.certificate = new aws.acm.Certificate(
      `${args.domain}-certificate`,
      {
        domainName: args.domain,
        subjectAlternativeNames: args.subjectAlternativeNames,
        validationMethod: 'DNS',
        region: args.region,
        tags: commonTags,
      },
      { parent: this },
    );
    this.certificateValidation = this.createCertValidationRecords(
      args.domain,
      args.hostedZoneId,
      args.region,
    );

    this.registerOutputs();
  }

  private createCertValidationRecords(
    domainName: AcmCertificate.Args['domain'],
    hostedZoneId: AcmCertificate.Args['hostedZoneId'],
    region: AcmCertificate.Args['region'],
  ) {
    return this.certificate.domainValidationOptions.apply(domains => {
      const validationRecords = domains.map(
        domain =>
          new aws.route53.Record(
            `${domain.domainName}-cert-validation-domain`,
            {
              name: domain.resourceRecordName,
              type: domain.resourceRecordType,
              zoneId: hostedZoneId,
              records: [domain.resourceRecordValue],
              ttl: 600,
            },
            {
              parent: this,
              deleteBeforeReplace: true,
            },
          ),
      );

      return new aws.acm.CertificateValidation(
        `${domainName}-cert-validation`,
        {
          certificateArn: this.certificate.arn,
          validationRecordFqdns: validationRecords.map(record => record.fqdn),
          region,
        },
        { parent: this },
      );
    });
  }
}
