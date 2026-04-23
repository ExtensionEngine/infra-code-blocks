import { createTextBoxVariable } from './helpers';

export function createSearchTextVariable() {
  return createTextBoxVariable('search_text', 'Search message');
}

export function createSearchHttpUrl() {
  return createTextBoxVariable('http_url_query', 'Search by http url');
}

export function createSearchMessage() {
  return createTextBoxVariable('message_query', 'Search inside message');
}
