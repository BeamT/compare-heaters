// Energy rates by ZIP, from a yearly snapshot (see scripts/rates). The snapshot
// is split by 3-digit ZIP prefix, so the page loads only the visitor's file.
import { EVENING_FACTOR, type Rates } from './assumptions.ts';

/** One prefix's file, `rates/<first 3 digits>.json`. */
export interface Shard {
  /** The prefix's most common state, for ZIPs it doesn't list. */
  state: string;
  zips: Record<string, { state: string; utilities: number[] }>;
  /** Average commercial $/kWh per utility. A ZIP's first utility is its default. */
  utilities: Array<{ name: string; rate: number }>;
  /** Commercial averages: $/kWh electricity, $/therm gas. A missing value falls back to the US one. */
  states: Record<string, StateRates>;
  us: Required<StateRates>;
  /** The year each source's averages are from. */
  years: { utilities: number; electric: number; gas: number };
}

export interface StateRates {
  electric?: number;
  gas?: number;
}

/** `rates/us.json`, for ZIP prefixes the snapshot doesn't cover. */
export type NationalRates = Pick<Shard, 'us' | 'years'>;

export interface UtilityRate {
  name: string;
  /** $/kWh. */
  eveningRate: number;
  /** Which bill to check, for the assumptions panel. */
  source: string;
}

export interface ZipRates {
  state: string;
  /** The default first. A ZIP with no known utility gets its state's average, or the US one. */
  utilities: UtilityRate[];
  /** $/therm. */
  naturalGas: { rate: number; source: string };
}

/** Reads one snapshot file by name (`941.json`); resolves to undefined when there's no such file. */
export type Load = (file: string) => Promise<unknown>;

/** Rounds as written, so 0.1375 → 0.138 despite floating point. */
export const roundTo = (value: number, places: number) => Number(`${Math.round(Number(`${value}e${places}`))}e-${places}`);

async function national(load: Load): Promise<NationalRates> {
  const rates = (await load('us.json')) as NationalRates | undefined;
  if (!rates) throw new Error('The rate snapshot has no us.json');
  return rates;
}

/** The rates for a ZIP, loading only its prefix's file. */
export async function lookupRates(zip: string, load: Load): Promise<ZipRates> {
  const shard =
    (/^\d{5}$/.test(zip) ? ((await load(`${zip.slice(0, 3)}.json`)) as Shard | undefined) : undefined) ??
    { state: 'US', zips: {}, utilities: [], states: {}, ...(await national(load)) };
  const state = shard.zips[zip]?.state ?? shard.state;
  const { years } = shard;
  const evening = (name: string, rate: number, source: string): UtilityRate => ({
    name,
    eveningRate: roundTo(rate * EVENING_FACTOR, 3),
    source: `${source} × ${EVENING_FACTOR} for evenings`,
  });
  /** The state's average, or the US one where the state has none. */
  const average = (kind: keyof StateRates) => {
    const rate = shard.states[state]?.[kind];
    return rate === undefined ? { rate: shard.us[kind], area: 'US' } : { rate, area: state };
  };
  const [electric, gas] = [average('electric'), average('gas')];
  const utilities = (shard.zips[zip]?.utilities ?? []).map(i => {
    const { name, rate } = shard.utilities[i]!;
    return evening(name, rate, `${name} ${years.utilities} average`);
  });
  return {
    state,
    utilities: utilities.length ? utilities : [evening(`${electric.area} commercial average`, electric.rate, `${electric.area} ${years.electric} commercial average`)],
    naturalGas: { rate: gas.rate, source: `${gas.area} ${years.gas} commercial average` },
  };
}

/** The calculator's rates for the chosen utility. */
export function ratesFor(rates: ZipRates, utility = 0): Rates {
  return { eveningElectricRate: (rates.utilities[utility] ?? rates.utilities[0]!).eveningRate, naturalGasRate: rates.naturalGas.rate };
}
