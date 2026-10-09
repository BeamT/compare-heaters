// Rebuilds the rate snapshot in public/rates from its sources. Run yearly; see REFRESH.md.
//   EIA_API_KEY=… node scripts/rates/refresh.ts
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRates, type StateAverage, type ZipRow } from './build.ts';
import { OVERRIDES } from './overrides.ts';

/** NREL "U.S. Electric Utility Companies and Rates: Look-up by Zip Code" (CC BY 4.0). Update the year each refresh. */
const ZIP_TABLE_YEAR = 2024;
const ZIP_TABLES = ['iou', 'non_iou'].map(kind => `https://data.openei.org/files/8563/${kind}_zipcodes_${ZIP_TABLE_YEAR}.csv`);

const EIA = 'https://api.eia.gov/v2';
const EIA_KEY = process.env.EIA_API_KEY ?? 'DEMO_KEY';
const OUT = 'public/rates';

async function get(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url.replace(EIA_KEY, '…')}`);
  return res.text();
}

/** Rows of a CSV with a header line; handles quoted fields, but not line breaks inside them. */
function parseCsv(text: string): Array<Record<string, string>> {
  const records = text.trim().split(/\r?\n/).map(line => [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)].map(m => m[1]?.replaceAll('""', '"') ?? m[2] ?? ''));
  const [header = [], ...rows] = records;
  return rows.map(row => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ''])));
}

async function zipRows(): Promise<ZipRow[]> {
  const tables = await Promise.all(ZIP_TABLES.map(get));
  return tables.flatMap(parseCsv).map(r => ({
    zip: r.zip!.padStart(5, '0'),
    eiaid: r.eiaid!,
    name: r.utility_name!,
    state: r.state!,
    serviceType: r.service_type!,
    ownership: r.ownership!,
    commRate: Number(r.comm_rate),
  }));
}

/** Annual commercial averages by state from the EIA API, the last few years. */
async function eia(route: string, params: string, value: string, stateOf: (row: Record<string, string>) => string): Promise<StateAverage[]> {
  const start = new Date().getFullYear() - 3;
  const url = `${EIA}/${route}/data/?api_key=${EIA_KEY}&frequency=annual&data[0]=${value}&${params}&start=${start}&length=5000`;
  const body = JSON.parse(await get(url)) as { response: { data: Array<Record<string, string>> } };
  return body.response.data
    .map(row => ({ state: stateOf(row), year: Number(row.period), value: Number(row[value]) }))
    .filter(a => a.value > 0); // withheld values come back empty
}

const [rows, electric, gas] = await Promise.all([
  zipRows(),
  // ¢/kWh, by two-letter state ('US' for the nation)
  eia('electricity/retail-sales', 'facets[sectorid][]=COM', 'price', row => row.stateid!),
  // $/Mcf, by area: 'SCA' for California, 'NUS' for the nation
  eia('natural-gas/pri/sum', 'facets[process][]=PCS', 'value', row => (row.duoarea === 'NUS' ? 'US' : row.duoarea!.slice(1))),
]);
const { shards, national } = buildRates({ zipRows: rows, utilitiesYear: ZIP_TABLE_YEAR, electric, gas }, OVERRIDES);

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) if (file.endsWith('.json')) rmSync(join(OUT, file));
for (const [prefix, shard] of Object.entries(shards)) writeFileSync(join(OUT, `${prefix}.json`), JSON.stringify(shard));
writeFileSync(join(OUT, 'us.json'), JSON.stringify(national));
console.log(`${Object.keys(shards).length} prefix files, years ${JSON.stringify(national.years)}, US ${JSON.stringify(national.us)}`);
