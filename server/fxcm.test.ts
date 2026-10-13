import { describe, expect, it } from 'vitest';
import { parseArchiveCsv } from './fxcm.ts';

describe('parseArchiveCsv', () => {
  it('reads bid candles and the spread, skipping the header and out-of-order rows', () => {
    const csv = [
      'DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen,AskHigh,AskLow,AskClose\r',
      '02/04/2024 22:00:00.000,1.0782,1.07849,1.0782,1.07848,1.0788,1.07885,1.0788,1.07882\r',
      '02/04/2024 22:03:00.000,1.07848,1.07851,1.07816,1.0782,1.07882,1.07882,1.07843,1.07843\r',
      '02/04/2024 22:03:00.000,9,9,9,9,9,9,9,9\r',
      'garbage',
      '',
    ].join('\n');
    expect(parseArchiveCsv(csv)).toEqual([
      [Date.UTC(2024, 1, 4, 22, 0) / 1000, 1.0782, 1.07849, 1.0782, 1.07848, 0.00047],
      [Date.UTC(2024, 1, 4, 22, 3) / 1000, 1.07848, 1.07851, 1.07816, 1.0782, 0.000285],
    ]);
  });
});
