import { createCustomVariable } from './helpers';

const STATUS_CODES = [
  { text: 'N/A', value: '!ispresent(statusCode)' },
  { text: '1xx', value: 'statusCode >= 100 and statusCode < 200' },
  { text: '2xx', value: 'statusCode >= 200 and statusCode < 300' },
  { text: '3xx', value: 'statusCode >= 300 and statusCode < 400' },
  { text: '4xx', value: 'statusCode >= 400 and statusCode < 500' },
  { text: '5xx', value: 'statusCode >= 500 and statusCode < 600' },
];

export function createStatusCodeVariable() {
  return createCustomVariable(
    'status_code',
    'Status Code',
    STATUS_CODES,
    STATUS_CODES[0],
  );
}
