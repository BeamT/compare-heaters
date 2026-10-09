import { describe, expect, it } from 'vitest';
import { lookupRates, ratesFor, type NationalRates, type Shard } from './rates.ts';

const years = { utilities: 2024, electric: 2025, gas: 2025 };
const us = { electric: 0.134, gas: 1.06 };

const files: Record<string, Shard | NationalRates> = {
  '941.json': {
    state: 'CA',
    zips: {
      '94110': { state: 'CA', utilities: [0, 1] },
      '94199': { state: 'CA', utilities: [] },
    },
    utilities: [{ name: 'Bay Power', rate: 0.395 }, { name: 'City Power', rate: 0.185 }],
    states: { CA: { electric: 0.264, gas: 1.6 } },
    us,
    years,
  },
  '820.json': {
    state: 'WY',
    zips: { '82001': { state: 'WY', utilities: [0] } },
    utilities: [{ name: 'Plains Power', rate: 0.11 }],
    states: { WY: {} },
    us,
    years,
  },
  'us.json': { us, years },
};

/** A loader over the files above that records what it was asked for. */
function loader() {
  const loaded: string[] = [];
  const load = async (file: string) => {
    loaded.push(file);
    return files[file];
  };
  return { load, loaded };
}

describe('lookupRates', () => {
  it("gives each of the ZIP's utilities an evening rate of its average × 1.25, with the state's gas rate, from one file", async () => {
    const { load, loaded } = loader();
    expect(await lookupRates('94110', load)).toEqual({
      state: 'CA',
      utilities: [
        { name: 'Bay Power', eveningRate: 0.494, source: 'Bay Power 2024 average × 1.25 for evenings' },
        { name: 'City Power', eveningRate: 0.231, source: 'City Power 2024 average × 1.25 for evenings' },
      ],
      naturalGas: { rate: 1.6, source: 'CA 2025 commercial average' },
    });
    expect(loaded).toEqual(['941.json']);
  });

  it("uses the state's average where no utility is known for the ZIP", async () => {
    const stateAverage = [{ name: 'CA commercial average', eveningRate: 0.33, source: 'CA 2025 commercial average × 1.25 for evenings' }];
    expect((await lookupRates('94199', loader().load)).utilities).toEqual(stateAverage); // listed, but its utility reports no rate
    expect((await lookupRates('94188', loader().load)).utilities).toEqual(stateAverage); // not listed
  });

  it('uses the US average for what the state has no average for', async () => {
    expect(await lookupRates('82001', loader().load)).toEqual({
      state: 'WY',
      utilities: [{ name: 'Plains Power', eveningRate: 0.138, source: 'Plains Power 2024 average × 1.25 for evenings' }],
      naturalGas: { rate: 1.06, source: 'US 2025 commercial average' },
    });
    expect((await lookupRates('82009', loader().load)).utilities).toEqual([
      { name: 'US commercial average', eveningRate: 0.168, source: 'US 2025 commercial average × 1.25 for evenings' },
    ]);
  });

  it('uses the US averages for a ZIP prefix the snapshot has no file for, or anything that isn’t a ZIP', async () => {
    const national = {
      state: 'US',
      utilities: [{ name: 'US commercial average', eveningRate: 0.168, source: 'US 2025 commercial average × 1.25 for evenings' }],
      naturalGas: { rate: 1.06, source: 'US 2025 commercial average' },
    };
    const noFile = loader();
    expect(await lookupRates('00501', noFile.load)).toEqual(national);
    expect(noFile.loaded).toEqual(['005.json', 'us.json']);
    for (const notAZip of ['9411', '941100', '../x', 'abcde', '']) {
      const { load, loaded } = loader();
      expect(await lookupRates(notAZip, load)).toEqual(national);
      expect(loaded).toEqual(['us.json']);
    }
  });

  it("hands the chosen utility's rates to the calculator", async () => {
    const rates = await lookupRates('94110', loader().load);
    expect(ratesFor(rates)).toEqual({ eveningElectricRate: 0.494, naturalGasRate: 1.6 });
    expect(ratesFor(rates, 1)).toEqual({ eveningElectricRate: 0.231, naturalGasRate: 1.6 });
  });
});
