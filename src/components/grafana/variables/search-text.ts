import { createTextBoxVariable } from './helpers';

export function createSearchTextVariable() {
  return createTextBoxVariable('search_text', 'Search message');
}

export function createSearchMessage() {
  return createTextBoxVariable('message_query', 'Search inside message');
}

export function createSearchQueryVariable() {
  return createTextBoxVariable(
    'search_query',
    'Search',
    'Search inside the whole message (case sensitive)',
  );
}

export function createSearchUrlVariable() {
  return createTextBoxVariable(
    'search_url_query',
    'Search by URL',
    'Search only within URLs in the message',
  );
}

export function createSearchHttpUrl() {
  return createTextBoxVariable('http_url_query', 'Search by http url');
}
