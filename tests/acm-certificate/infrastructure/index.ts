import { next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';

const appName = 'acm-certificate-test';

const hostedZone = aws.route53.getZoneOutput({
  zoneId: process.env.ICB_HOSTED_ZONE_ID,
  privateZone: false,
});

const certificate = new studion.AcmCertificate(`${appName}-certificate`, {
  domain: process.env.ICB_DOMAIN_NAME!,
  hostedZoneId: hostedZone.zoneId,
});

export { certificate, hostedZone };
