// Turns the downloaded sources into the rate snapshot the page loads: one file
// per 3-digit ZIP prefix. Pure, so the rules are tested apart from the downloads.
import { roundTo, type NationalRates, type Shard, type StateRates } from '../../src/rates.ts';

/** One row of the ZIP → utility tables: a utility serving a ZIP, and its average rates. */
export interface ZipRow {
  zip: string;
  eiaid: string;
  name: string;
  state: string;
  /** Bundled = sells the power; Delivery = only owns the wires. */
  serviceType: string;
  ownership: string;
  /** Average commercial $/kWh. */
  commRate: number;
}

/** A state's (or the US's, as 'US') yearly commercial average. */
export interface StateAverage {
  state: string;
  year: number;
  value: number;
}

export interface Sources {
  zipRows: ZipRow[];
  /** The year the ZIP table's utility rates are from. */
  utilitiesYear: number;
  /** ¢/kWh. */
  electric: StateAverage[];
  /** $/Mcf. */
  gas: StateAverage[];
}

export interface Overrides {
  /** Names visitors know a utility by, by EIA ID. */
  names: Record<string, string>;
  /** Fixes for wrong mappings: list `utility` first wherever `servedBy` is listed without it. */
  add: Array<{ utility: string; servedBy: string }>;
}

export interface RateSnapshot {
  /** By 3-digit ZIP prefix. */
  shards: Record<string, Shard>;
  national: NationalRates;
}

/** Natural gas heat content, delivered average: 1,036 BTU/ft³ (EIA). */
export const THERMS_PER_MCF = 10.36;

/** A row as the snapshot uses it; `added` rows come from an override and are listed first. */
type Row = ZipRow & { added?: boolean };

export function buildRates(sources: Sources, overrides: Overrides): RateSnapshot {
  const bundled = sources.zipRows
    .filter(row => row.serviceType === 'Bundled')
    .map(row => ({ ...row, name: overrides.names[row.eiaid] ?? row.name }));
  const byPrefix = new Map<string, Row[]>();
  for (const row of [...bundled, ...added(bundled, overrides.add)]) {
    const prefix = row.zip.slice(0, 3);
    byPrefix.set(prefix, byPrefix.get(prefix) ?? []).get(prefix)!.push(row);
  }
  const electric = latestFullYear(sources.electric, cents => roundTo(cents / 100, 3));
  const gas = latestFullYear(sources.gas, perMcf => roundTo(perMcf / THERMS_PER_MCF, 2));
  const national: NationalRates = {
    us: { electric: electric.byState.get('US')!, gas: gas.byState.get('US')! },
    years: { utilities: sources.utilitiesYear, electric: electric.year, gas: gas.year },
  };
  const stateRates = (state: string): StateRates => {
    const [e, g] = [electric.byState.get(state), gas.byState.get(state)];
    return { ...(e === undefined ? {} : { electric: e }), ...(g === undefined ? {} : { gas: g }) };
  };
  const statesIn = (rows: Row[]) => Object.fromEntries([...new Set(rows.map(r => r.state))].sort().map(state => [state, stateRates(state)]));
  const shards: Record<string, Shard> = {};
  for (const [prefix, rows] of byPrefix) shards[prefix] = { ...shard(rows), states: statesIn(rows), ...national };
  return { shards, national };
}

/** Each state's value in the latest year that has a US value, so all averages share one year. */
function latestFullYear(averages: StateAverage[], convert: (value: number) => number) {
  const year = Math.max(...averages.filter(a => a.state === 'US').map(a => a.year));
  if (!Number.isFinite(year)) throw new Error('No US average in the source');
  return { year, byState: new Map(averages.filter(a => a.year === year).map(a => [a.state, convert(a.value)])) };
}

/** The state most of the rows' ZIPs are in. */
function mainState(zips: Shard['zips']): string {
  const counts = new Map<string, number>();
  for (const { state } of Object.values(zips)) counts.set(state, (counts.get(state) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

/** Rows for the utilities each override adds, at that utility's rate in the ZIP's state. */
function added(rows: ZipRow[], adds: Overrides['add']): Row[] {
  return adds.flatMap(({ utility, servedBy }) => {
    const rateIn = new Map(rows.filter(r => r.eiaid === utility && r.commRate > 0).map(r => [r.state, r]));
    const listed = new Set(rows.filter(r => r.eiaid === utility).map(r => r.zip));
    return rows.flatMap(r => {
      const template = rateIn.get(r.state);
      return r.eiaid === servedBy && !listed.has(r.zip) && template ? [{ ...template, zip: r.zip, added: true }] : [];
    });
  });
}

/** Override-added utilities first, then investor-owned ones: where a ZIP lists several, the IOU usually serves the town itself. */
const byDefaultOrder = (a: Row, b: Row) =>
  Number(!!b.added) - Number(!!a.added) ||
  Number(b.ownership === 'Investor Owned') - Number(a.ownership === 'Investor Owned') ||
  a.name.localeCompare(b.name);

/** A utility's rates differ by state, so it's one entry per state. */
const utilityKey = (row: Row) => `${row.eiaid} ${row.state}`;

function shard(rows: Row[]): Pick<Shard, 'state' | 'zips' | 'utilities'> {
  const rowsByZip = new Map<string, Map<string, Row>>();
  const zips: Shard['zips'] = {};
  for (const row of rows) {
    zips[row.zip] ??= { state: row.state, utilities: [] };
    if (!(row.commRate > 0)) continue; // a few utilities report no rate
    const zipRows = rowsByZip.get(row.zip) ?? new Map<string, Row>();
    rowsByZip.set(row.zip, zipRows.set(utilityKey(row), row));
  }
  const utilities: Shard['utilities'] = [];
  const index = new Map<string, number>();
  for (const [zip, zipRows] of rowsByZip) {
    for (const row of [...zipRows.values()].sort(byDefaultOrder)) {
      const key = utilityKey(row);
      if (!index.has(key)) index.set(key, utilities.push({ name: row.name, rate: roundTo(row.commRate, 3) }) - 1);
      zips[zip]!.utilities.push(index.get(key)!);
    }
  }
  return { state: mainState(zips), zips, utilities };
}
