import { next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws-v7';
import * as infraConfig from './config';

const appName = 'acm-certificate-test';

const hostedZone = aws.route53.getZoneOutput({
  zoneId: process.env.ICB_HOSTED_ZONE_ID,
  privateZone: false,
});

const certificate = new studion.AcmCertificate(`${appName}-certificate`, {
  domain: infraConfig.certificateDomain,
  hostedZoneId: hostedZone.zoneId,
});

const sanCertificate = new studion.AcmCertificate(
  `${appName}-certificate-san`,
  {
    domain: infraConfig.sanCertificateDomain,
    subjectAlternativeNames: infraConfig.certificateSANs,
    hostedZoneId: hostedZone.zoneId,
  },
);

const regionCertificate = new studion.AcmCertificate(`${appName}-region-cert`, {
  domain: infraConfig.regionCertificateDomain,
  hostedZoneId: hostedZone.zoneId,
  region: infraConfig.alternateRegion,
});

export { certificate, sanCertificate, regionCertificate, hostedZone };
