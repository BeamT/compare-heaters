// Everything the visitor has entered or chosen. It lives only in the query
// string, so the browser URL reopens the same view.
import { MONTHS, OPTIONS, PATIO_DEFAULTS, type HourRange, type MonthRange, type OptionKey } from '../assumptions.ts';

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
}

export const MAX_SEATS = 9999;

export const DEFAULT_STATE: PageState = { zip: '', utility: '', seats: undefined, ...PATIO_DEFAULTS, hidden: [] };

/** One query-string parameter: how to write its part of the state, and how to read it back (undefined when invalid). */
interface Param {
  name: string;
  write: (state: PageState) => string;
  read: (value: string) => Partial<PageState> | undefined;
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
    read: v => {
      const [start, end] = v.split('-').map(month);
      return start && end ? { season: { start, end } } : undefined;
    },
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
    const part = value === null ? undefined : read(value);
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
