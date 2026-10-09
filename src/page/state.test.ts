import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, parseQuery, toQuery, type PageState } from './state.ts';

describe('page state in the query string', () => {
  it('opens a blank link at the defaults, and keeps defaults out of the link', () => {
    expect(parseQuery('')).toEqual(DEFAULT_STATE);
    expect(toQuery(DEFAULT_STATE)).toBe('');
  });

  it('writes a readable link that reopens the same view', () => {
    const state: PageState = {
      zip: '94110',
      utility: 'PG&E',
      seats: 40,
      occupancy: 0.35,
      season: { start: 'Nov', end: 'Mar' },
      daysPerWeek: 5,
      heatingHours: { start: 17.5, end: 1 },
      hidden: ['gas'],
    };
    const query = toQuery(state);
    expect(query).toBe('?zip=94110&utility=PG%26E&seats=40&occupancy=35&season=Nov-Mar&days=5&hours=17.5-1&hide=gas');
    expect(parseQuery(query)).toEqual(state);
  });

  it('keeps the defaults for anything a hand-edited link gets wrong', () => {
    const state = parseQuery('?zip=9411&seats=0&occupancy=33&season=Oct-Smarch&days=8&hours=17-25');
    expect(state).toEqual(DEFAULT_STATE);
    expect(parseQuery('?zip=80202&seats=abc&days=6')).toEqual({ ...DEFAULT_STATE, zip: '80202', daysPerWeek: 6 });
  });

  it('remembers which comparisons are hidden', () => {
    const state: PageState = { ...DEFAULT_STATE, hidden: ['propane', 'electric'] };
    expect(toQuery(state)).toBe('?hide=propane,electric');
    expect(parseQuery('?hide=electric,focal,propane,electric')).toEqual(state);
  });

  it("keeps the host page's own parameters, and replaces only ours", () => {
    const state: PageState = { ...DEFAULT_STATE, zip: '80202', seats: 24 };
    expect(toQuery(state, '?utm_source=summit&seats=40&hide=gas')).toBe('?utm_source=summit&zip=80202&seats=24');
    expect(toQuery(DEFAULT_STATE, '?utm_source=summit&zip=94110')).toBe('?utm_source=summit');
  });
});
