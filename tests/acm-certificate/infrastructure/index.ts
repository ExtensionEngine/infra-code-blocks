import { next as studion } from '@studion/infra-code-blocks';
import * as aws from '@pulumi/aws';

const appName = 'acm-certificate-test';

const hostedZone = aws.route53.getZoneOutput({
  name: process.env.HOSTED_ZONE_NAME,
  privateZone: false,
});

const certificate = new studion.AcmCertificate(`${appName}-certificate`, {
  domain: process.env.DOMAIN_NAME!,
  hostedZoneId: hostedZone.zoneId,
});

module.exports = {
  certificate,
  hostedZone,
};
