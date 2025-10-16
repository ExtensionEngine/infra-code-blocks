export const testConfig = {
  mongoTestName: 'mongo-test',
  mongoUser: 'testuser',
  mongoPort: 27017,
  exponentialBackOffConfig: {
    delayFirstAttempt: true,
    numOfAttempts: 5,
    startingDelay: 2000,
    timeMultiple: 2,
    jitter: 'full',
  },
} as const;
