export const appName = 'cloudfront-test';

export const defaultDomain = `cf-dmn.${process.env.ICB_DOMAIN_NAME}`;

export const certificateDomain = `cf-crt.${process.env.ICB_DOMAIN_NAME}`;

export const certificateSANs = [
  `cf-alt1.${process.env.ICB_DOMAIN_NAME}`,
  `cf-alt2.${process.env.ICB_DOMAIN_NAME}`,
];

export const loadBalancerDomain = `lb.${process.env.ICB_DOMAIN_NAME}`;

export const cfMinimalName = `${appName}-minimal`;

export const cfMinimalOriginId = `cf-minimal-oid`;

export const cfMinimalOriginProtocolPolicy = 'http-only';

export const cfMinimalDefaultRootObject = 'index.html';

export const cfWithVariousBehaviorsLbPathPattern = '/api/*';

export const cfWithVariousBehaviorsS3PathPattern = '/www/*';

export const cfWithVariousBehaviorsCustomOriginProtocolPolicy = 'http-only';

export const cfWithVariousBehaviorsCustomDefaultRootObject = 'index.html';

export const cfWithVariousBehaviorsCustomAllowedMethods = ['GET', 'HEAD'];

export const cfWithVariousBehaviorsCustomCompress = true;
