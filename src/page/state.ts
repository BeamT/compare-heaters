// Everything the visitor has entered or chosen. It lives only in the query
// string, so the browser URL reopens the same view.
import { ASSUMPTIONS, EDITABLE, MONTHS, OPTIONS, PATIO_DEFAULTS, REVENUE_DEFAULTS, type Assumptions, type HourRange, type MonthRange, type OptionKey, type RevenueInputs } from '../assumptions.ts';

/** The options a visitor can hide; Focal is always shown. */
export type Competitor = Exclude<OptionKey, 'focal'>;
export const COMPETITORS = OPTIONS.filter((o): o is Competitor => o !== 'focal');

export interface PageState {
  /** Empty until entered. */
  zip: string;
  /** The chosen utility's name, when the ZIP has several; empty for the ZIP's first. Stored by name so a rate refresh can't switch it. */
  utility: string;
  /** Undefined until entered. */
  seats: number | undefined;
  occupancy: number;
  season: MonthRange;
  daysPerWeek: number;
  heatingHours: HourRange;
  /** In table order. */
  hidden: Competitor[];
  /** "Do you heat your patio today?" Only a no opens the revenue estimate. */
  heatToday: boolean;
  revenue: RevenueInputs;
  /** The assumptions panel's tab. */
  tab: PanelTab;
  /** Assumptions the visitor changed in the panel. */
  overrides: Partial<Assumptions>;
}

export type PanelTab = OptionKey | 'all';
const TABS: readonly PanelTab[] = [...OPTIONS, 'all'];

export const MAX_SEATS = 9999;

export const DEFAULT_STATE: PageState = { zip: '', utility: '', seats: undefined, ...PATIO_DEFAULTS, hidden: [], heatToday: true, revenue: REVENUE_DEFAULTS, tab: 'focal', overrides: {} };

/** One query-string parameter: how to write its part of the state, and how to read it back (undefined when invalid). */
interface Param {
  name: string;
  write: (state: PageState) => string;
  /** Gets the state read so far, to fill in nested parts. */
  read: (value: string, state: PageState) => Partial<PageState> | undefined;
}

const int = (value: string, min: number, max: number) => {
  const n = Number(value);
  return /^\d+$/.test(value) && n >= min && n <= max ? n : undefined;
};
/** Reads a whole number from min to max into one field of the state. */
const intParam = <K extends 'seats' | 'daysPerWeek'>(key: K, min: number, max: number) => (value: string) => {
  const n = int(value, min, max);
  return n === undefined ? undefined : ({ [key]: n } as Partial<PageState>);
};
const month = (value: string | undefined) => MONTHS.find(m => m === value);
/** A number like 42, 42.5 or .5, from min (inclusive, or exclusive when 0 must be ruled out) to max. */
const decimal = (value: string, min: number, max: number, { above = false } = {}) => {
  const n = Number(value);
  return /^(\d+\.?\d*|\.\d+)$/.test(value) && (above ? n > min : n >= min) && n <= max ? n : undefined;
};
/** Lifespans and seats per heater divide, so they can't be 0. */
const DIVISORS: ReadonlySet<keyof Assumptions> = new Set(['propaneTowerLifespan', 'gasLifespan', 'electricLifespan', 'propaneSeatsPerTower', 'gasSeatsPerHeater', 'electricSeatsPerHeater']);

/** An editable assumption's value from text ("yes"/"no" for a checkbox); undefined when it isn't one. */
export function readAssumption(key: keyof Assumptions, value: string): number | boolean | undefined {
  if (!EDITABLE.includes(key)) return undefined;
  if (typeof ASSUMPTIONS[key].default === 'boolean') return value === 'yes' ? true : value === 'no' ? false : undefined;
  return decimal(value, 0, 10_000_000, { above: DIVISORS.has(key) });
}

const monthRange = (value: string): MonthRange | undefined => {
  const [start, end, ...rest] = value.split('-').map(month);
  return start && end && !rest.length ? { start, end } : undefined;
};
/** Writes and reads one of the revenue estimate's inputs. */
const revenueParam = <K extends keyof RevenueInputs>(
  name: string,
  key: K,
  write: (value: NonNullable<RevenueInputs[K]>) => string,
  read: (value: string) => RevenueInputs[K] | undefined,
): Param => ({
  name,
  write: s => { const value = s.revenue[key]; return value === undefined ? '' : write(value); },
  read: (v, s) => { const value = read(v); return value === undefined ? undefined : { revenue: { ...s.revenue, [key]: value } }; },
});

const PARAMS: Param[] = [
  { name: 'zip', write: s => s.zip, read: v => (/^\d{5}$/.test(v) ? { zip: v } : undefined) },
  { name: 'utility', write: s => s.utility, read: utility => ({ utility }) },
  { name: 'seats', write: s => (s.seats === undefined ? '' : String(s.seats)), read: intParam('seats', 1, MAX_SEATS) },
  {
    name: 'occupancy',
    write: s => String(Math.round(s.occupancy * 100)),
    read: v => { const pct = int(v, 10, 100); return pct === undefined || pct % 5 ? undefined : { occupancy: pct / 100 }; },
  },
  {
    name: 'season',
    write: s => `${s.season.start}-${s.season.end}`,
    read: v => { const season = monthRange(v); return season && { season }; },
  },
  { name: 'days', write: s => String(s.daysPerWeek), read: intParam('daysPerWeek', 1, 7) },
  {
    name: 'hours',
    write: s => `${s.heatingHours.start}-${s.heatingHours.end}`,
    read: v => {
      const [start, end] = v.split('-').map(halfHour);
      return start === undefined || end === undefined ? undefined : { heatingHours: { start, end } };
    },
  },
  {
    name: 'hide',
    write: s => s.hidden.join(','),
    read: v => {
      const names = v.split(',');
      return { hidden: COMPETITORS.filter(c => names.includes(c)) };
    },
  },
  { name: 'tab', write: s => s.tab, read: v => { const tab = TABS.find(t => t === v); return tab && { tab }; } },
  { name: 'heat', write: s => (s.heatToday ? '' : 'no'), read: v => (v === 'no' ? { heatToday: false } : undefined) },
  revenueParam('check', 'averageCheck', String, v => decimal(v, 0, 10_000)),
  revenueParam('table', 'timeAtTable', String, v => decimal(v, 0, 24, { above: true })),
  revenueParam('closed', 'closedMonths', m => `${m.start}-${m.end}`, monthRange),
  revenueParam('guests', 'extraGuestsPerColdNight', String, v => decimal(v, 0, 10_000)),
  revenueParam('spend', 'extraSpendPerGuest', String, v => decimal(v, 0, 10_000)),
  revenueParam('margin', 'margin', m => String(Math.round(m * 100)), v => { const pct = int(v, 0, 100); return pct === undefined ? undefined : pct / 100; }),
  ...EDITABLE.map((key): Param => ({
    name: key,
    write: s => { const value = s.overrides[key]; return value === undefined ? '' : typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value); },
    read: (v, s) => {
      const value = readAssumption(key, v);
      if (value === undefined) return undefined;
      // A default typed back in isn't an edit, so the link stays clean.
      const { [key]: _, ...rest } = s.overrides;
      return { overrides: value === ASSUMPTIONS[key].default ? rest : { ...rest, [key]: value } };
    },
  })),
];

/** A time of day in half-hour steps, 0–23.5. */
function halfHour(value: string | undefined): number | undefined {
  const n = Number(value);
  return value && /^\d+(\.5)?$/.test(value) && n < 24 ? n : undefined;
}

/** The state a link describes. Missing or invalid parameters keep their defaults. */
export function parseQuery(query: string): PageState {
  const params = new URLSearchParams(query);
  let state = DEFAULT_STATE;
  for (const { name, read } of PARAMS) {
    const value = params.get(name);
    const part = value === null ? undefined : read(value, state);
    if (part) state = { ...state, ...part };
  }
  return state;
}

const encode = (value: string) => encodeURIComponent(value).replaceAll('%2C', ',');

/**
 * The query string for a state, leaving out what's at its default. Parameters
 * of the page around the calculator (`current`) are kept, ahead of ours.
 */
export function toQuery(state: PageState, current = ''): string {
  const ours = new Set(PARAMS.map(p => p.name));
  const theirs = [...new URLSearchParams(current)].filter(([name]) => !ours.has(name));
  const parts = [
    ...theirs.map(([name, value]) => `${encode(name)}=${encode(value)}`),
    ...PARAMS.flatMap(({ name, write }) => {
      const value = write(state);
      return value === write(DEFAULT_STATE) ? [] : [`${name}=${encode(value)}`];
    }),
  ];
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * The state with one parameter set from what the visitor typed. Blank goes
 * back to the default; a value that isn't valid changes nothing.
 */
export function setParam(state: PageState, name: string, value: string): PageState {
  const param = PARAMS.find(p => p.name === name);
  if (!param) return state;
  if (value === '') {
    const params = new URLSearchParams(toQuery(state));
    params.delete(name);
    return parseQuery(params.toString());
  }
  const part = param.read(value, state);
  return part ? { ...state, ...part } : state;
}
