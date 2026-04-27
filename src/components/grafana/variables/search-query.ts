import { createTextBoxVariable } from './helpers';

export function createSearchQueryVariable() {
  return createTextBoxVariable(
    'search_query',
    'Search',
    'Search inside the whole message (case sensitive)',
  );
}
