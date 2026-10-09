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

function ready(state: PageState = sf, rates: ZipRates = sfRates) {
  const model = pageModel(state, rates);
  if (model.kind !== 'ready') throw new Error(`expected results, got ${model.kind}`);
  return model;
}

describe('experience card', () => {
  /** Each row as "label: ✓ — ✓ … (Focal's line)". */
  const marks = (state: PageState) =>
    ready(state).experience.rows.map(r => `${r.label}: ${r.checks.map(c => (c ? '✓' : '—')).join(' ')} (${r.how})`);

  it('puts the benefits side by side, with how Focal does each', () => {
    expect(marks(sf)).toEqual([
      'Every guest is comfortable: ✓ — — — (Guests set their own heat)',
      'No heating empty seats: ✓ — — — (Off when guests leave and at close)',
      'No fuel to buy, store or swap: ✓ — ✓ ✓ (Plugs into a standard 120V outlet)',
      'Nothing burning near guests: ✓ — — ✓ (No flame, no exhaust to breathe)',
      'Nothing for guests or staff to trip over: ✓ — ✓ ✓ (Mounted overhead)',
      'Heat follows your tables when you rearrange: ✓ ✓ — — (Slides anywhere on the rail)',
      'Nothing to maintain: ✓ — — — (We monitor and fix issues)',
    ]);
  });

  it('hides the same columns as the cost table', () => {
    expect(marks({ ...sf, hidden: ['propane', 'electric'] })[2]).toBe('No fuel to buy, store or swap: ✓ ✓ (Plugs into a standard 120V outlet)');
  });
});

describe('revenue upside', () => {
  const noHeat: PageState = { ...sf, heatToday: false };
  const lines = (state: PageState) => {
    const { revenue } = ready(state);
    if (!revenue.open) throw new Error('expected the revenue inputs');
    return revenue;
  };
  const texts = (state: PageState) => {
    const r = lines(state);
    return [r.moreMonthsOpen, r.moreTablesSeated, r.biggerChecks, r.total, r.paysForItself].map(c => c.text);
  };

  it('stays closed for visitors who already heat their patio', () => {
    expect(ready(sf).revenue).toEqual({ open: false });
  });

  it('shows a dash on every line until its own input is filled', () => {
    expect(texts(noHeat)).toEqual(['—', '—', '—', '—', '—']);
    expect(lines(noHeat).moreMonthsOpen.tip).toBe('');
    expect(texts({ ...noHeat, revenue: { ...noHeat.revenue, averageCheck: 45, extraGuestsPerColdNight: 6 } }))
      .toEqual(['—', '+$57,330/yr', '—', '+$57,330/yr', '1.4 seasons']);
  });

  it('adds up the lines and when Focal pays for itself, each with its formula', () => {
    const estimate = { ...noHeat.revenue, averageCheck: 45, closedMonths: { start: 'Jan', end: 'Feb' }, extraGuestsPerColdNight: 6 } as const;
    const r = lines({ ...noHeat, revenue: estimate });
    expect(texts({ ...noHeat, revenue: estimate })).toEqual(['+$218,400/yr', '+$40,950/yr', '—', '+$259,350/yr', '0.2 seasons']);
    expect(r.total.tip).toBe('$259,350/yr = $218,400 more months + $40,950 more tables');
    expect(r.paysForItself.tip).toBe('0.2 heating seasons = $23,850 Focal upfront ÷ ($259,350 × 40% margin − $6,421 Focal yearly cost)');
  });

  it('warns when some closed months fall outside the heating season', () => {
    const closed = (start: 'Jan' | 'Apr', end: 'Feb' | 'May') => ({ ...noHeat, revenue: { ...noHeat.revenue, averageCheck: 45, closedMonths: { start, end } } });
    expect(lines(closed('Apr', 'May')).warning).toBe('1 of the 2 closed months falls inside your heating season (Oct–Apr); only that one counts.');
    expect(lines(closed('Jan', 'Feb')).warning).toBeUndefined();
  });
});

describe('assumptions panel', () => {
  /** Each row as "label = value unit [affects]", group titles as "# title". */
  const panel = (state: PageState) => {
    const p = ready(state).panel;
    return p.groups.flatMap(g => [
      ...(g.title ? [`# ${g.title}`] : []),
      ...g.rows.map(r => `${r.label} = ${r.value}${r.unit ? ` ${r.unit}` : ''} [${r.affects.map(a => a.label).join(', ')}]`),
    ]);
  };

  it("opens on Focal's tab, listing what else each value affects", () => {
    const p = ready(sf).panel;
    expect(p.tabs.map(t => `${t.label}${t.selected ? '*' : ''}`)).toEqual(['Focal*', 'Propane towers', 'Natural gas', 'Conventional electric', 'All']);
    expect(p.affectsHeading).toBe('Also affects');
    expect(panel(sf)).toEqual([
      'Evening electricity rate = 0.494 $/kWh [Conventional electric]',
      'New circuit cost = 350 $/circuit [Natural gas, Conventional electric]',
      '120V outlets already in place = false [Natural gas]',
      'Installer rate = 100 $/hr [Natural gas, Conventional electric]',
      'Focal install time = 2 hrs/rail []',
    ]);
    expect(p.groups[0]!.rows[0]!.description).toBe('What you pay per kWh during evening service. Use the rate from your bill if you know it.');
  });

  it('tags the ZIP-based rates with their source, the evening rate as an estimate', () => {
    const rows = ready({ ...sf, tab: 'all' }).panel.groups.flatMap(g => g.rows);
    expect(rows.find(r => r.key === 'eveningElectricRate')?.tag).toBe('Estimate: PG&E 2024 average × 1.25 for evenings');
    expect(rows.find(r => r.key === 'naturalGasRate')?.tag).toBe('CA 2024 commercial average');
    expect(rows.find(r => r.key === 'installerRate')?.tag).toBeUndefined();
  });

  it("groups every row under its option on the All tab, and lists only what's shown", () => {
    const all = panel({ ...sf, tab: 'all', hidden: ['gas'] });
    expect(ready({ ...sf, tab: 'all' }).panel.affectsHeading).toBe('Affects');
    expect(all.filter(line => line.startsWith('#'))).toEqual(['# Focal', '# Propane towers', '# Conventional electric']);
    expect(all.slice(0, 3)).toEqual([
      '# Focal',
      'Evening electricity rate = 0.494 $/kWh [Focal, Conventional electric]',
      'New circuit cost = 350 $/circuit [Focal, Conventional electric]',
    ]);
    expect(all.some(line => /gas/i.test(line))).toBe(false);
    expect(all).toContain('240V circuits already in place = false [Conventional electric]');
    const withGas = panel({ ...sf, tab: 'all' });
    expect(withGas[withGas.indexOf('# Natural gas') + 1]).toBe('Natural gas rate = 1.45 $/therm [Natural gas]');
  });

  it("falls back to Focal's tab when the chosen option is hidden", () => {
    const p = ready({ ...sf, tab: 'propane', hidden: ['propane'] }).panel;
    expect(p.tabs.find(t => t.selected)?.key).toBe('focal');
  });
});

describe('editing an assumption', () => {
  const cost = (state: PageState, label: string) => table(state).sections.flatMap(s => s.rows).find(r => r.label === label)!.cells;

  it('reworks the costs and shows the new value in the panel', () => {
    const edited = { ...sf, overrides: { installerRate: 150, has120VOutlets: true } };
    // 7 rails × 2 hrs × $150/hr, outlets already in place
    expect(cost(edited, 'Install')[0]!.text).toBe('$2,100');
    const rows = ready(edited).panel.groups[0]!.rows;
    expect(rows.find(r => r.key === 'installerRate')?.value).toBe(150);
    expect(rows.find(r => r.key === 'has120VOutlets')?.value).toBe(true);
  });

  it("stops calling the evening rate an estimate once it's the visitor's own", () => {
    const edited = { ...sf, overrides: { eveningElectricRate: 0.3 } };
    const energy = cost(edited, 'Energy')[0]!.tip;
    expect(energy).toContain('× $0.300/kWh');
    expect(energy).not.toContain('estimate');
    expect(ready(edited).panel.groups[0]!.rows[0]!.tag).toBe('Your rate');
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
