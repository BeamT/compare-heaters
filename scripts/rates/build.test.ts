import { describe, expect, it } from 'vitest';
import { buildRates, type Overrides, type Sources, type ZipRow } from './build.ts';

const row = (zip: string, eiaid: string, name: string, commRate: number, more: Partial<ZipRow> = {}): ZipRow => ({
  zip, eiaid, name, state: 'CA', serviceType: 'Bundled', ownership: 'Investor Owned', commRate, ...more,
});

const NO_OVERRIDES: Overrides = { names: {}, add: [] };

function build(zipRows: ZipRow[], overrides = NO_OVERRIDES, more: Partial<Sources> = {}) {
  return buildRates({ zipRows, utilitiesYear: 2024, electric: [{ state: 'US', year: 2025, value: 13.41 }], gas: [{ state: 'US', year: 2025, value: 10.98 }], ...more }, overrides);
}

/** A ZIP's utilities as name → $/kWh, in order. */
function utilitiesAt(rates: ReturnType<typeof build>, zip: string) {
  const shard = rates.shards[zip.slice(0, 3)];
  return shard?.zips[zip]?.utilities.map(i => shard.utilities[i]!);
}

describe('buildRates', () => {
  it('keeps only utilities that sell the power, not ones that only deliver it', () => {
    const rates = build([
      row('10001', '4226', 'City Electric', 0.282),
      row('10001', '4226', 'City Electric', 0.11, { serviceType: 'Delivery' }),
    ]);
    expect(utilitiesAt(rates, '10001')).toEqual([{ name: 'City Electric', rate: 0.282 }]);
  });

  it('drops utilities with no rate, and keeps the ZIP for a state fallback', () => {
    const rates = build([
      row('80202', '1', 'Valley Co-op', 0, { state: 'CO' }),
      row('80203', '1', 'Valley Co-op', 0, { state: 'CO' }),
      row('80203', '2', 'Front Range Power', 0.118, { state: 'CO' }),
    ]);
    expect(rates.shards['802']?.zips['80202']).toEqual({ state: 'CO', utilities: [] });
    expect(utilitiesAt(rates, '80203')).toEqual([{ name: 'Front Range Power', rate: 0.118 }]);
  });

  it('lists the investor-owned utility first, then the rest by name, each once', () => {
    const rates = build([
      row('80435', '9', 'Summit Co-op', 0.123, { ownership: 'Cooperative' }),
      row('80435', '7', 'Alpine Co-op', 0.123, { ownership: 'Cooperative' }),
      row('80435', '5', 'Front Range Power', 0.118),
      row('80435', '5', 'Front Range Power', 0.118),
    ]);
    expect(utilitiesAt(rates, '80435')?.map(u => u.name)).toEqual(['Front Range Power', 'Alpine Co-op', 'Summit Co-op']);
  });

  it('rounds utility rates to a tenth of a cent', () => {
    expect(utilitiesAt(build([row('94133', '1', 'Bay Power', 0.3946264093704035)]), '94133')).toEqual([{ name: 'Bay Power', rate: 0.395 }]);
  });

  it("carries the state and US averages for the prefix's states, in $/kWh and $/therm, from the latest full year", () => {
    const rates = build([row('42201', '1', 'River Power', 0.11, { state: 'KY' }), row('42202', '2', 'Lake Power', 0.12, { state: 'TN' }), row('42203', '2', 'Lake Power', 0.12, { state: 'TN' })], NO_OVERRIDES, {
      electric: [
        { state: 'US', year: 2024, value: 13.1 },
        { state: 'US', year: 2025, value: 13.41 },
        { state: 'KY', year: 2025, value: 11.5 },
        { state: 'TN', year: 2025, value: 12.25 },
        { state: 'CA', year: 2025, value: 26.36 },
        { state: 'KY', year: 2026, value: 12 }, // a partial year: no US value yet
      ],
      gas: [
        { state: 'US', year: 2025, value: 10.98 },
        { state: 'KY', year: 2025, value: 12.71 },
        { state: 'TN', year: 2024, value: 9 }, // stale: TN falls back to the US value
      ],
    });
    const shard = rates.shards['422'];
    expect(shard?.states).toEqual({ KY: { electric: 0.115, gas: 1.23 }, TN: { electric: 0.123 } });
    expect(shard?.us).toEqual({ electric: 0.134, gas: 1.06 });
    expect(shard?.years).toEqual({ utilities: 2024, electric: 2025, gas: 2025 });
    expect(shard?.state).toBe('TN'); // most of the prefix's ZIPs
    expect(rates.national).toEqual({ us: { electric: 0.134, gas: 1.06 }, years: { utilities: 2024, electric: 2025, gas: 2025 } });
  });

  describe('overrides', () => {
    // The ZIP table lists only the city's utility for most of a city, though most businesses there buy from the regional one.
    const rows = [
      row('94110', '16612', 'City & County Power', 0.185, { ownership: 'Municipal' }),
      row('94133', '16612', 'City & County Power', 0.185, { ownership: 'Municipal' }),
      row('94133', '14328', 'Regional Gas & Electric Co.', 0.395),
      row('95814', '14328', 'Regional Gas & Electric Co.', 0.395),
    ];

    it('lists a missing utility first wherever the one it serves alongside is listed alone', () => {
      const rates = build(rows, { names: {}, add: [{ utility: '14328', servedBy: '16612' }] });
      expect(utilitiesAt(rates, '94110')).toEqual([
        { name: 'Regional Gas & Electric Co.', rate: 0.395 },
        { name: 'City & County Power', rate: 0.185 },
      ]);
      expect(utilitiesAt(rates, '94133')?.map(u => u.name)).toEqual(['Regional Gas & Electric Co.', 'City & County Power']);
      expect(utilitiesAt(rates, '95814')?.map(u => u.name)).toEqual(['Regional Gas & Electric Co.']);
    });

    it('names utilities the way visitors know them', () => {
      const rates = build(rows, { names: { '14328': 'RG&E', '16612': 'City Power' }, add: [] });
      expect(utilitiesAt(rates, '94133')?.map(u => u.name)).toEqual(['RG&E', 'City Power']);
    });
  });
});
