export const webServerName = 'web-server-test';
export const healthCheckPath = '/healthcheck';

const baseDomain = process.env.ICB_DOMAIN_NAME!;

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
