// What the page shows, worked out from the visitor's state and their ZIP's
// rates. Every number and tooltip comes from the engine; this only picks and
// orders them, so the page can't disagree with the tests.
import { defaultAssumptions, OPTIONS, REVENUE_DEFAULTS, type OptionKey } from '../assumptions.ts';
import { calculate, type OptionResult } from '../calculate.ts';
import { formatNumber, formatQuantity, q, tooltip, type Explained } from '../formula.ts';
import { ratesFor, type ZipRates } from '../rates.ts';
import type { Competitor, PageState } from './state.ts';

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

export type PageModel =
  | { kind: 'missing'; missing: Array<'zip' | 'seats'> }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      table: CostTable;
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
  const results = calculate({
    patio: { ...state, seats },
    assumptions: defaultAssumptions(ratesFor(rates, utility)),
    revenue: REVENUE_DEFAULTS,
  });
  const rateNote = {
    text: `The ${formatQuantity(q(eveningRate, 'rate', '/kWh'))} evening rate is an estimate (${source}). Use your bill's rate if you know it.`,
  };
  const explained = (option: OptionKey, key: RowSpec[1]): Explained => {
    const value = results[option][key];
    return key === 'energy' && ELECTRIC.includes(option) ? { ...value, lines: [...value.lines, rateNote] } : value;
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
    utilities: rates.utilities.map(u => u.name),
  };
}
