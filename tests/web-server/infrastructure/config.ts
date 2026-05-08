export const webServerName = 'web-server-test';

export const webServerImageName = 'nginxdemos/nginx-hello:plain-text';

export const webServerPort = 8080;

export const healthCheckPath = '/healthcheck';

export const healthCheckConfig = {
  healthyThreshold: 5,
  unhealthyThreshold: 3,
  interval: 15,
  timeout: 3,
};

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
