import { createCustomVariable } from './helpers';

const LIMITS = [
  { text: '20', value: 20 },
  { text: '50', value: 50 },
  { text: '100', value: 100 },
  { text: '250', value: 250 },
  { text: '500', value: 500 },
  { text: '1000', value: 1000 },
];

export function createLimitVariable() {
  return createCustomVariable('limit', 'Limit', LIMITS, LIMITS[0]);
}
