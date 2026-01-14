import { next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws-v7';
import { alternateRegion } from './config';

const appName = 'acm-certificate-test';

const hostedZone = aws.route53.getZoneOutput({
  zoneId: process.env.ICB_HOSTED_ZONE_ID,
  privateZone: false,
});

const domainName = process.env.ICB_DOMAIN_NAME!;
const certificate = new studion.AcmCertificate(`${appName}-certificate`, {
  domain: domainName,
  hostedZoneId: hostedZone.zoneId,
  region: process.env.AWS_REGION,
});

const subDomainName = `app.${domainName}`;
const sanCertificate = new studion.AcmCertificate(
  `${appName}-certificate-san`,
  {
    domain: subDomainName,
    subjectAlternativeNames: [`api.${subDomainName}`, `test.${subDomainName}`],
    hostedZoneId: hostedZone.zoneId,
  },
);

const regionCertificate = new studion.AcmCertificate(`${appName}-region-cert`, {
  domain: `region.${domainName}`,
  hostedZoneId: hostedZone.zoneId,
  region: alternateRegion,
});

export { certificate, sanCertificate, hostedZone, regionCertificate };
