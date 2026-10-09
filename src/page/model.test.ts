import { describe, expect, it } from 'vitest';
import type { ZipRates } from '../rates.ts';
import { pageModel, type CostTable } from './model.ts';
import { DEFAULT_STATE, type PageState } from './state.ts';

// SF 40-seat patio at default values, with the evening rate the spec's tooltip example uses.
const sf: PageState = { ...DEFAULT_STATE, zip: '94110', seats: 40 };
const sfRates: ZipRates = {
  state: 'CA',
  utilities: [
    { name: 'PG&E', eveningRate: 0.494, source: 'PG&E 2024 average × 1.25 for evenings' },
    { name: 'Other Power', eveningRate: 0.375, source: 'Other Power 2024 average × 1.25 for evenings' },
  ],
  naturalGas: { rate: 1.45, source: 'CA 2024 commercial average' },
};

function table(state: PageState = sf, rates: ZipRates = sfRates): CostTable {
  const model = pageModel(state, rates);
  if (model.kind !== 'ready') throw new Error(`expected a table, got ${model.kind}`);
  return model.table;
}

/** Each row as "label: column texts", section titles as "# title". */
const layout = (t: CostTable) =>
  t.sections.flatMap(s => [`# ${s.title}`, ...s.rows.map(r => `${r.label}: ${r.cells.map(c => c.text).join(' | ')}`)]);

describe('cost table', () => {
  it('shows the first 5 years, upfront and yearly costs at default values', () => {
    const t = table(sf, sfRates);
    expect(t.columns.map(c => c.label)).toEqual(['Focal', 'Propane towers', 'Natural gas', 'Conventional electric']);
    expect(layout(t).map(line => line.split(' | ')[0])).toEqual([
      '# First 5 years',
      'First 5 years total: $55,955',
      'First 5 years per seat: $1,399',
      '# Upfront',
      'Heaters: $20,000',
      'Install: $3,850',
      'Upfront total: $23,850',
      'Upfront per seat: $596',
      '# Yearly',
      'Energy: $3,021',
      'Staff time: $0',
      'Maintenance & replacement: $2,000',
      'Subscription: $1,400',
      'Yearly total: $6,421',
      'Yearly per seat: $161',
    ]);
  });

  it('fills the competitor columns from the engine, each number with its formula', () => {
    const t = table();
    const row = (label: string) => t.sections.flatMap(s => s.rows).find(r => r.label === label)!;
    expect(row('Energy').cells.map(c => c.text)).toEqual(['$3,021', '$15,766', '$2,155', '$8,391']);
    expect(row('Staff time').cells[1]).toEqual({
      text: '$7,743',
      tip: '$7,743 = (630.7 tanks × 20 min + 10 towers × 5 min × 212 nights) ÷ 60 × $20/hr',
    });
    expect(row('Install').cells[1]).toEqual({ text: '$0', tip: 'Nothing to install: towers stand on the patio floor.' });
  });

  it('drops hidden options, offers them back, and shows staff time only with propane', () => {
    const t = table({ ...sf, hidden: ['propane', 'electric'] });
    expect(t.columns.map(c => c.key)).toEqual(['focal', 'gas']);
    expect(t.hidden).toEqual([
      { key: 'propane', label: 'Propane towers' },
      { key: 'electric', label: 'Conventional electric' },
    ]);
    const labels = t.sections.flatMap(s => s.rows.map(r => r.label));
    expect(labels).not.toContain('Staff time');
    expect(labels).toContain('Subscription');
    expect(t.sections[0]!.rows[0]!.cells.map(c => c.text)).toEqual(['$55,955', '$67,126']);
  });

  it('labels the ZIP-based evening rate as an estimate wherever it shows', () => {
    const energy = table().sections[2]!.rows[0]!.cells;
    const note = "The $0.494/kWh evening rate is an estimate (PG&E 2024 average × 1.25 for evenings). Use your bill's rate if you know it.";
    expect(energy[0]!.tip.split('\n\n').at(-1)).toBe(note); // Focal
    expect(energy[3]!.tip.split('\n\n').at(-1)).toBe(note); // Conventional electric
    expect(energy[2]!.tip).not.toContain('estimate'); // Natural gas
  });
});

describe('utility', () => {
  it("offers a picker when the ZIP has several utilities, and uses the chosen one's rate", () => {
    const model = pageModel({ ...sf, utility: 'Other Power' }, sfRates);
    if (model.kind !== 'ready') throw new Error(model.kind);
    expect(model.utilities).toEqual(['PG&E', 'Other Power']);
    const focalEnergy = model.table.sections[2]!.rows[0]!.cells[0]!.tip;
    expect(focalEnergy).toContain('× $0.375/kWh');
    expect(focalEnergy).toContain('(Other Power 2024 average × 1.25 for evenings)');
  });

  it("falls back to the ZIP's first utility when a link names one it doesn't have", () => {
    const model = pageModel({ ...sf, utility: 'Gone Electric' }, sfRates);
    if (model.kind !== 'ready') throw new Error(model.kind);
    expect(model.table.sections[2]!.rows[0]!.cells[0]!.tip).toContain('× $0.494/kWh');
  });
});

describe('before there are results', () => {
  it('asks for a ZIP and seats first, then waits for the rates', () => {
    expect(pageModel(DEFAULT_STATE, undefined)).toEqual({ kind: 'missing', missing: ['zip', 'seats'] });
    expect(pageModel({ ...DEFAULT_STATE, seats: 40 }, undefined)).toEqual({ kind: 'missing', missing: ['zip'] });
    expect(pageModel({ ...DEFAULT_STATE, zip: '94110' }, sfRates)).toEqual({ kind: 'missing', missing: ['seats'] });
    expect(pageModel(sf, undefined)).toEqual({ kind: 'loading' });
  });
});
