import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, parseQuery, setParam, toQuery, withClosedCapped, type PageState } from './state.ts';

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
      heatingMonths: 5,
      daysPerWeek: 5,
      hoursPerDay: 14,
      hidden: ['gas'],
      heatToday: true,
      revenue: { timeAtTable: 1.5 },
      tab: 'all',
      overrides: {},
    };
    const query = toQuery(state);
    expect(query).toBe('?zip=94110&utility=PG%26E&seats=40&occupancy=35&months=5&days=5&hours=14&hide=gas&tab=all');
    expect(parseQuery(query)).toEqual(state);
  });

  it("keeps the visitor's revenue estimate", () => {
    const state: PageState = {
      ...DEFAULT_STATE,
      heatToday: false,
      revenue: { averageCheck: 42.5, timeAtTable: 1.25, monthsClosed: 2, extraGuestsPerColdDay: 6, extraSpendPerGuest: 8 },
    };
    const query = toQuery(state);
    expect(query).toBe('?heat=no&check=42.5&table=1.25&closed=2&guests=6&spend=8');
    expect(parseQuery(query)).toEqual(state);
    // Blank inputs stay blank, and nonsense keeps the defaults.
    expect(parseQuery('?heat=maybe&check=-5&table=0&closed=0&guests=x')).toEqual(DEFAULT_STATE);
  });

  it('keeps the defaults for anything a hand-edited link gets wrong', () => {
    const state = parseQuery('?zip=9411&seats=0&occupancy=33&months=13&days=8&hours=25');
    expect(state).toEqual(DEFAULT_STATE);
    expect(parseQuery('?zip=80202&seats=abc&days=6')).toEqual({ ...DEFAULT_STATE, zip: '80202', daysPerWeek: 6 });
    // Whole hours only.
    expect(parseQuery('?hours=5.5')).toEqual(DEFAULT_STATE);
  });

  it('keeps the assumptions the visitor edited, and only those that can be edited', () => {
    const state: PageState = { ...DEFAULT_STATE, overrides: { eveningElectricRate: 0.3, has120VOutlets: true, gasLifespan: 12.5 } };
    const query = toQuery(state);
    expect(query).toBe('?eveningElectricRate=0.3&has120VOutlets=yes&gasLifespan=12.5');
    expect(parseQuery(query)).toEqual(state);
    // A lifespan or seat count of 0 would divide by zero; fixed values like Focal's price aren't editable.
    expect(parseQuery('?gasLifespan=0&propaneSeatsPerTower=0&focalPrice=1&installerRate=-1&has240VCircuits=maybe')).toEqual(DEFAULT_STATE);
    expect(parseQuery('?gasLineCost=0').overrides).toEqual({ gasLineCost: 0 });
  });

  it('takes one typed value at a time: blank goes back to the default, nonsense changes nothing', () => {
    const state = setParam(setParam(DEFAULT_STATE, 'check', '45'), 'installerRate', '150');
    expect(state.revenue.averageCheck).toBe(45);
    expect(state.overrides).toEqual({ installerRate: 150 });
    expect(setParam(state, 'installerRate', 'abc')).toEqual(state);
    expect(setParam(state, 'eveningElectricRate', '.35').overrides).toEqual({ installerRate: 150, eveningElectricRate: 0.35 });
    expect(setParam(state, 'installerRate', '').overrides).toEqual({});
    expect(setParam(state, 'check', '').revenue).toEqual(DEFAULT_STATE.revenue);
    // Typing a default back in leaves the link clean.
    expect(setParam(state, 'installerRate', '100').overrides).toEqual({});
    expect(toQuery(setParam(state, 'has120VOutlets', 'no'))).toBe('?check=45&installerRate=150');
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

describe('closed months', () => {
  it('are never more than the heating months, in the state or a link', () => {
    const state: PageState = { ...DEFAULT_STATE, heatingMonths: 3, revenue: { ...DEFAULT_STATE.revenue, monthsClosed: 5 } };
    expect(withClosedCapped(state).revenue.monthsClosed).toBe(3);
    expect(parseQuery('?months=3&closed=5').revenue.monthsClosed).toBe(3);
    expect(setParam(parseQuery('?closed=4'), 'months', '2').revenue.monthsClosed).toBe(2);
  });
});
