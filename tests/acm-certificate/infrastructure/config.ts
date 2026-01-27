export const alternateRegion =
  process.env.AWS_REGION === 'eu-central-1' ? 'us-west-1' : 'eu-central-1';

const baseDomain = `acm.${process.env.ICB_DOMAIN_NAME!}`;

export const certificateDomain = `crt.${baseDomain}`;

export const sanCertificateDomain = `san.${baseDomain}`;

export const certificateSANs = [
  `alt1.${sanCertificateDomain}`,
  `alt2.${sanCertificateDomain}`,
];

export const regionCertificateDomain = `region.${baseDomain}`;
