import { next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws-v7';
import { alternateRegion } from './config';

const appName = 'acm-certificate-test';

const hostedZone = aws.route53.getZoneOutput({
  zoneId: process.env.ICB_HOSTED_ZONE_ID,
  privateZone: false,
});

const baseDomain = `acm.${process.env.ICB_DOMAIN_NAME!}`;

const certificate = new studion.AcmCertificate(`${appName}-certificate`, {
  domain: baseDomain,
  hostedZoneId: hostedZone.zoneId,
});

const subDomainName = `app.${baseDomain}`;
const sanCertificate = new studion.AcmCertificate(
  `${appName}-certificate-san`,
  {
    domain: subDomainName,
    subjectAlternativeNames: [`api.${subDomainName}`, `test.${subDomainName}`],
    hostedZoneId: hostedZone.zoneId,
  },
);

const regionCertificate = new studion.AcmCertificate(`${appName}-region-cert`, {
  domain: `region.${baseDomain}`,
  hostedZoneId: hostedZone.zoneId,
  region: alternateRegion,
});

export { certificate, sanCertificate, regionCertificate, hostedZone };
