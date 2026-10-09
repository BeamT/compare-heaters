// Hand-entered fixes to the ZIP → utility table, by EIA utility ID.
import type { Overrides } from './build.ts';

export const OVERRIDES: Overrides = {
  names: {
    '4226': 'Con Edison',
    '14328': 'PG&E',
    '15466': 'Xcel Energy',
    '16612': 'SFPUC',
  },
  add: [
    // The table lists only the city utility for most San Francisco ZIPs, though
    // most businesses there buy from PG&E.
    { utility: '14328', servedBy: '16612' },
  ],
};
