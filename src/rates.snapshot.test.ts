// Checks the committed snapshot in public/rates, so a refresh can't ship rates
// that make no sense for the markets we know.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lookupRates } from './rates.ts';

const DIR = 'public/rates';
const load = async (file: string) => {
  try {
    return JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8'));
  } catch {
    return undefined;
  }
};

describe('rate snapshot', () => {
  // Ranges are wide enough to survive a yearly refresh, narrow enough to catch a wrong utility or unit.
  it.each([
    { place: 'San Francisco (Mission)', zip: '94110', utility: 'PG&E', evening: [0.42, 0.6], gas: [1.2, 2.2] },
    { place: 'San Francisco (downtown)', zip: '94102', utility: 'PG&E', evening: [0.42, 0.6], gas: [1.2, 2.2] },
    { place: 'Denver', zip: '80202', utility: 'Xcel Energy', evening: [0.12, 0.22], gas: [0.6, 1.3] },
    { place: 'Austin', zip: '78701', utility: 'Austin Energy', evening: [0.1, 0.2], gas: [0.7, 1.4] },
    { place: 'New York', zip: '10001', utility: 'Con Edison', evening: [0.3, 0.45], gas: [0.8, 1.6] },
  ])('gives $place ($zip) its utility and sensible rates', async ({ zip, utility, evening, gas }) => {
    const rates = await lookupRates(zip, load);
    expect(rates.utilities[0]?.name).toBe(utility);
    expect(rates.utilities[0]?.eveningRate).toBeGreaterThanOrEqual(evening[0]!);
    expect(rates.utilities[0]?.eveningRate).toBeLessThanOrEqual(evening[1]!);
    expect(rates.naturalGas.rate).toBeGreaterThanOrEqual(gas[0]!);
    expect(rates.naturalGas.rate).toBeLessThanOrEqual(gas[1]!);
  });

  it('keeps every file small enough to load quickly on a phone', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(800);
    for (const file of files) expect(statSync(`${DIR}/${file}`).size, file).toBeLessThan(10_000);
  });
});
