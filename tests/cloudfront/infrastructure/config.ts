export const appName = 'cloudfront-test';

export const cfMinimalName = `${appName}-minimal`;

export const cfMinimalOriginId = `cf-minimal-oid`;

export const cfMinimalOriginProtocolPolicy = 'http-only';

export const cfMinimalDefaultRootObject = 'index.html';

export const certificateDomain = `sub.${process.env.ICB_DOMAIN_NAME}`;
