import { next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

const appName = 'acm-certificate-test';

const domainName = process.env.DOMAIN_NAME!;

const hostedZone = pulumi.output(
  aws.route53
    .getZone({
      name: domainName,
      privateZone: false,
    })
    .catch(() => {
      const hostedZoneId = process.env.HOSTED_ZONE_ID;
      if (!hostedZoneId) {
        throw new Error(
          'HOSTED_ZONE_ID environment variable is required when hosted zone cannot be found by domain name',
        );
      }
      return aws.route53.getZone({
        zoneId: hostedZoneId,
        privateZone: false,
      });
    }),
);

const certificate = new studion.AcmCertificate(`${appName}-certificate`, {
  domain: domainName,
  hostedZoneId: hostedZone.zoneId,
});

const subDomainName = `app.${process.env.DOMAIN_NAME!}`;
const sanCertificate = new studion.AcmCertificate(
  `${appName}-certificate-san`,
  {
    domain: subDomainName,
    subjectAlternativeNames: [`api.${subDomainName}`, `test.${subDomainName}`],
    hostedZoneId: hostedZone.zoneId,
  },
);

module.exports = {
  certificate,
  sanCertificate,
  hostedZone,
};
