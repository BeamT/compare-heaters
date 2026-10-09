// What the page shows, worked out from the visitor's state and their ZIP's
// rates. Every number and tooltip comes from the engine; this only picks and
// orders them, so the page can't disagree with the tests.
import { ASSUMPTIONS, defaultAssumptions, EDITABLE, OPTIONS, type Assumptions, type OptionKey } from '../assumptions.ts';
import { calculate, type OptionResult, type RevenueResult } from '../calculate.ts';
import { FEATURES } from '../features.ts';
import { formatNumber, formatQuantity, q, tooltip, type Explained } from '../formula.ts';
import { ratesFor, type ZipRates } from '../rates.ts';
import type { Competitor, PageState, PanelTab } from './state.ts';

export const OPTION_LABELS: Record<OptionKey, string> = {
  focal: 'Focal',
  propane: 'Propane towers',
  gas: 'Natural gas',
  electric: 'Conventional electric',
};

export interface Cell {
  text: string;
  tip: string;
}

export interface CostRow {
  label: string;
  /** Totals read like line items; per-seat figures stand out. */
  kind: 'item' | 'total' | 'perSeat';
  /** One per column. */
  cells: Cell[];
}

export interface CostTable {
  columns: Array<{ key: OptionKey; label: string }>;
  /** Offered back as "+ name" buttons. */
  hidden: Array<{ key: Competitor; label: string }>;
  sections: Array<{ title: string; rows: CostRow[] }>;
}

/** The ✓/— benefit matrix, in the cost table's columns. */
export interface Experience {
  rows: Array<{ label: string; /** One per column. */ checks: boolean[]; /** How Focal does it. */ how: string }>;
}

/** A revenue line's number; "—" with no tooltip until its own input is filled. */
const BLANK: Cell = { text: '—', tip: '' };

export type Revenue =
  | { open: false }
  | {
      open: true;
      moreMonthsOpen: Cell;
      moreTablesSeated: Cell;
      biggerChecks: Cell;
      total: Cell;
      paysForItself: Cell;
      /** When some closed months fall outside the heating season. */
      warning?: string;
    };

/** The assumptions a visitor might know differently, editable in the panel. */
export interface PanelRow {
  key: keyof Assumptions;
  label: string;
  unit: string;
  description: string;
  value: number | boolean;
  /** Where a ZIP-based rate comes from, so the visitor knows which bill to check. */
  tag?: string;
  /** On an option's tab, only the other options. */
  affects: Array<{ key: OptionKey; label: string }>;
}

export interface Panel {
  tabs: Array<{ key: PanelTab; label: string; selected: boolean }>;
  affectsHeading: 'Affects' | 'Also affects';
  /** One untitled group on an option's tab; on All, one per option, then "Shared". */
  groups: Array<{ title?: string; rows: PanelRow[] }>;
}

export type PageModel =
  | { kind: 'missing'; missing: Array<'zip' | 'seats'> }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      table: CostTable;
      experience: Experience;
      revenue: Revenue;
      panel: Panel;
      /** The ZIP's utilities, for a picker when there are several. */
      utilities: string[];
    };

type RowSpec = [label: string, key: keyof Omit<OptionResult, 'units'>, kind?: CostRow['kind']];

const SECTIONS: Array<{ title: string; rows: RowSpec[] }> = [
  {
    title: 'First 5 years',
    rows: [
      ['First 5 years total', 'fiveYear', 'total'],
      ['First 5 years per seat', 'fiveYearPerSeat', 'perSeat'],
    ],
  },
  {
    title: 'Upfront',
    rows: [
      ['Heaters', 'hardware'],
      ['Install', 'install'],
      ['Upfront total', 'upfront', 'total'],
      ['Upfront per seat', 'upfrontPerSeat', 'perSeat'],
    ],
  },
  {
    title: 'Yearly',
    rows: [
      ['Energy', 'energy'],
      ['Staff time', 'staffTime'],
      ['Maintenance & replacement', 'maintenance'],
      ['Subscription', 'subscription'],
      ['Yearly total', 'yearly', 'total'],
      ['Yearly per seat', 'yearlyPerSeat', 'perSeat'],
    ],
  },
];

/** The options whose energy runs on the evening electricity rate. */
const ELECTRIC: readonly OptionKey[] = ['focal', 'electric'];

const cell = (explained: Explained): Cell => ({ text: formatNumber(explained.value, 'usd'), tip: tooltip(explained) });

/** `rates` are the state's ZIP's, or undefined while they load. */
export function pageModel(state: PageState, rates: ZipRates | undefined): PageModel {
  const { zip, seats } = state;
  if (!zip || !seats) return { kind: 'missing', missing: [...(zip ? [] : ['zip' as const]), ...(seats ? [] : ['seats' as const])] };
  if (!rates) return { kind: 'loading' };
  const utility = Math.max(0, rates.utilities.findIndex(u => u.name === state.utility));
  const { eveningRate, source } = rates.utilities[utility]!;
  const assumptions = { ...defaultAssumptions(ratesFor(rates, utility)), ...state.overrides };
  const ownRate = state.overrides.eveningElectricRate !== undefined;
  const results = calculate({
    patio: { ...state, seats },
    assumptions,
    revenue: state.revenue,
  });
  const rateNote = {
    text: `The ${formatQuantity(q(eveningRate, 'rate', '/kWh'))} evening rate is an estimate (${source}). Use your bill's rate if you know it.`,
  };
  const explained = (option: OptionKey, key: RowSpec[1]): Explained => {
    const value = results[option][key];
    return key === 'energy' && ELECTRIC.includes(option) && !ownRate ? { ...value, lines: [...value.lines, rateNote] } : value;
  };
  const shown = OPTIONS.filter(o => !state.hidden.includes(o as Competitor));
  // Only propane takes staff time.
  const showRow = (key: RowSpec[1]) => key !== 'staffTime' || shown.includes('propane');
  return {
    kind: 'ready',
    table: {
      columns: shown.map(key => ({ key, label: OPTION_LABELS[key] })),
      hidden: state.hidden.map(key => ({ key, label: OPTION_LABELS[key] })),
      sections: SECTIONS.map(({ title, rows }) => ({
        title,
        rows: rows.filter(([, key]) => showRow(key)).map(([label, key, kind = 'item']) => ({ label, kind, cells: shown.map(o => cell(explained(o, key))) })),
      })),
    },
    experience: { rows: FEATURES.map(f => ({ label: f.label, checks: shown.map(o => f.has[o]), how: f.focal })) },
    revenue: state.heatToday ? { open: false } : revenue(results.revenue, state),
    panel: panel(state.tab, shown, assumptions, {
      eveningElectricRate: ownRate ? 'Your rate' : `Estimate: ${source}. Use your bill's rate if you know it.`,
      naturalGasRate: state.overrides.naturalGasRate === undefined ? rates.naturalGas.source : 'Your rate',
    }),
    utilities: rates.utilities.map(u => u.name),
  };
}

function revenue(r: RevenueResult, { season }: PageState): Revenue {
  const perYear = (line: Explained | null): Cell => (line ? { text: `+${formatNumber(line.value, 'usd')}/yr`, tip: tooltip(line) } : BLANK);
  const outside = r.closedMonths - r.closedMonthsInSeason;
  const inSeason = r.closedMonthsInSeason;
  const seasonName = `${season.start}–${season.end}`;
  const warning = !outside
    ? undefined
    : !inSeason
      ? `None of the closed months fall inside your heating season (${seasonName}), so none count.`
      : inSeason === 1
        ? `1 of the ${r.closedMonths} closed months falls inside your heating season (${seasonName}); only that one counts.`
        : `${inSeason} of the ${r.closedMonths} closed months fall inside your heating season (${seasonName}); only those count.`;
  return {
    open: true,
    moreMonthsOpen: perYear(r.moreMonthsOpen),
    moreTablesSeated: perYear(r.moreTablesSeated),
    biggerChecks: perYear(r.biggerChecks),
    total: perYear(r.total),
    paysForItself: r.paysForItself ? { text: `${formatNumber(r.paysForItself.value, 'tenths')} seasons`, tip: tooltip(r.paysForItself) } : BLANK,
    ...(warning === undefined ? {} : { warning }),
  };
}

function panel(selected: PanelTab, shown: OptionKey[], assumptions: Assumptions, tags: Partial<Record<keyof Assumptions, string>>): Panel {
  const tab = selected === 'all' || shown.includes(selected) ? selected : 'focal';
  const label = (key: OptionKey) => ({ key, label: OPTION_LABELS[key] });
  // A row shows while anything it affects is shown.
  const rows = EDITABLE.flatMap(key => {
    const on = ASSUMPTIONS[key].affects.filter(o => shown.includes(o));
    return on.length ? [{ key, on }] : [];
  });
  const row = ({ key, on }: (typeof rows)[number], affects: OptionKey[]): PanelRow => {
    const { label: name, unit, description = '' } = ASSUMPTIONS[key];
    const tag = tags[key];
    return { key, label: name, unit, description, value: assumptions[key], ...(tag === undefined ? {} : { tag }), affects: affects.map(label) };
  };
  // On All, a row's home is Focal if it touches Focal, else the one option it drives, else "Shared".
  const home = ({ on }: (typeof rows)[number]) => (on.includes('focal') ? 'focal' : on.length === 1 ? on[0]! : 'shared');
  const groups: Panel['groups'] =
    tab === 'all'
      ? [...shown, 'shared' as const].flatMap(g => {
          const mine = rows.filter(r => home(r) === g);
          return mine.length ? [{ title: g === 'shared' ? 'Shared' : OPTION_LABELS[g], rows: mine.map(r => row(r, r.on)) }] : [];
        })
      : [{ rows: rows.filter(r => r.on.includes(tab)).map(r => row(r, r.on.filter(o => o !== tab))) }];
  return {
    tabs: [...shown, 'all' as const].map(key => ({ key, label: key === 'all' ? 'All' : OPTION_LABELS[key], selected: key === tab })),
    affectsHeading: tab === 'all' ? 'Affects' : 'Also affects',
    groups,
  };
}
