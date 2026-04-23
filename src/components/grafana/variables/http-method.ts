import { createCustomVariable } from './helpers';

const HTTP_METHODS = [
  { text: 'N/A', value: '!ispresent(httpMethod)' },
  { text: 'GET', value: "httpMethod = 'GET'" },
  { text: 'POST', value: "httpMethod = 'POST'" },
  { text: 'PUT', value: "httpMethod = 'PUT'" },
  { text: 'PATCH', value: "httpMethod = 'PATCH'" },
  { text: 'DELETE', value: "httpMethod = 'DELETE'" },
  { text: 'HEAD', value: "httpMethod = 'HEAD'" },
  { text: 'OPTIONS', value: "httpMethod = 'OPTIONS'" },
  { text: 'TRACE', value: "httpMethod = 'TRACE'" },
  { text: 'CONNECT', value: "httpMethod = 'CONNECT'" },
];
export function createHttpMethodVariable() {
  return createCustomVariable(
    'http_method',
    'Http method',
    HTTP_METHODS,
    HTTP_METHODS[0],
  );
}
