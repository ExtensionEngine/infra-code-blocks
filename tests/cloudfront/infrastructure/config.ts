export const appName = 'cloudfront-test';

export const baseDomain = `cf.${process.env.ICB_DOMAIN_NAME}`;

export const defaultDomain = `dmn.${baseDomain}`;

export const certificateDomain = `crt.${baseDomain}`;

export const certificateSANs = [`alt1.${baseDomain}`, `alt2.${baseDomain}`];

export const loadBalancerDomain = `lb.${baseDomain}`;

export const cfMinimalName = `${appName}-minimal`;

export const cfMinimalOriginId = `cf-minimal-oid`;

export const cfMinimalOriginProtocolPolicy = 'http-only';

export const cfMinimalDefaultRootObject = 'index.html';

export const cfWithVariousBehaviorsLbPathPattern = '/api/*';

export const cfWithVariousBehaviorsS3PathPattern = '/www/*';

export const cfWithVariousBehaviorsS3TtlPathPattern = '/www-ttl/*';

export const cfWithVariousBehaviorsCustomOriginProtocolPolicy = 'http-only';

export const cfWithVariousBehaviorsCustomDefaultRootObject = 'index.html';

export const cfWithVariousBehaviorsCustomAllowedMethods = ['GET', 'HEAD'];

export const cfWithVariousBehaviorsCustomCompress = true;
