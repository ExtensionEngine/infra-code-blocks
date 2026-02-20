export const appName = 'otel-test';

export const appImage = 'studiondev/observability-sample-app-image';
export const appPort = 3000;

export const usersPath = '/users';
export const errorPath = '/error';

export const prometheusNamespace = 'icb_otel_integration';

export const exponentialBackOffConfig = {
  delayFirstAttempt: true,
  numOfAttempts: 10,
  startingDelay: 5000,
  timeMultiple: 1.5,
  jitter: 'full' as const,
};
