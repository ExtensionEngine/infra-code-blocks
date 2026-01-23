export const webServerName = 'web-server-test';
export const healthCheckPath = '/healthcheck';

export const webServerImageName = 'nginxdemos/nginx-hello:plain-text';
export const webServerPort = 8080;

const baseDomain = `ws.${process.env.ICB_DOMAIN_NAME!}`;

export const webServerWithDomainConfig = {
  primary: `domain.${baseDomain}`,
};

export const webServerWithSanCertificateConfig = {
  primary: baseDomain,
  sans: [`api.${baseDomain}`, `app.${baseDomain}`],
};

export const webServerWithCertificateConfig = {
  primary: `test.${baseDomain}`,
  sans: [`test.api.${baseDomain}`, `test.app.${baseDomain}`],
};

export const exponentialBackOffConfig = {
  delayFirstAttempt: true,
  numOfAttempts: 10,
  startingDelay: 2000,
  timeMultiple: 2,
  jitter: 'full' as const,
};
