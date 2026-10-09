import { describe, expect, it } from 'vitest';
import { defaultAssumptions, PATIO_DEFAULTS, REVENUE_DEFAULTS, type Assumptions, type Patio, type RevenueInputs } from './assumptions.ts';
import { calculate } from './calculate.ts';
import { tooltip } from './formula.ts';

// SF 40-seat patio at default values, with the evening rate rounded as the spec's example shows it.
const sfPatio: Patio = { ...PATIO_DEFAULTS, seats: 40 };
const sfRates = { eveningElectricRate: 0.494, naturalGasRate: 1.45 };

function run(patio: Patio = sfPatio, assumptions: Partial<Assumptions> = {}, revenue: Partial<RevenueInputs> = {}) {
  return calculate({
    patio,
    assumptions: { ...defaultAssumptions(sfRates), ...assumptions },
    revenue: { ...REVENUE_DEFAULTS, ...revenue },
  });
}

describe('formula tooltips', () => {
  it('shows Focal energy at default values as in the spec', () => {
    const { focal } = run();
    expect(Math.round(focal.energy.value)).toBe(3021);
    expect(tooltip(focal.energy)).toBe(
      [
        '12 of 20 Duos on = ⌈20 × 60%⌉, rounded up to whole heaters',
        '$3,021 = 12 Duos on × 0.6 kW × 1,062 hrs × 0.8 heat setting × $0.494/kWh',
        '1,062 hrs = 7 days/wk × 7 months × 4.33 wks/mo × 5 hrs/day',
      ].join('\n\n'),
    );
  });

  it('explains propane fuel through the tanks it burns', () => {
    expect(tooltip(run().propane.energy)).toBe(
      [
        '6 of 10 towers on = ⌈10 × 60%⌉, rounded up to whole heaters',
        '$15,766 = 630.7 tanks × $25 exchange',
        '630.7 tanks = 6 towers on × 40,000 BTU/hr × 1,062 hrs × 0.8 heat setting ÷ (15 lb/tank × 21,548 BTU/lb)',
        '1,062 hrs = 7 days/wk × 7 months × 4.33 wks/mo × 5 hrs/day',
      ].join('\n\n'),
    );
  });

  it('explains propane staff time from tank swaps and daily setup', () => {
    expect(tooltip(run().propane.staffTime)).toBe('$7,743 = (630.7 tanks × 20 min + 10 towers × 5 min × 212 days) ÷ 60 × $20/hr');
  });

  it('explains gas energy in therms', () => {
    expect(tooltip(run().gas.energy).split('\n\n')[1]).toBe(
      '$2,155 = 5 heaters on × 35,000 BTU/hr × 1,062 hrs × 0.8 heat setting ÷ 100,000 BTU/therm × $1.45/therm',
    );
  });

  it('splits install into labor and circuits, and zeroes circuits already in place', () => {
    expect(tooltip(run().gas.install)).toBe('$15,050 = 7 heaters × (6 hrs × $100/hr + $350 ignition circuit + $1,200 gas line)');
    expect(tooltip(run(sfPatio, { has120VOutlets: true }).focal.install)).toBe('$1,400 = 7 rails × (2 hrs × $100/hr + $0 circuit — outlets in place)');
  });

  it('builds the totals from the line items', () => {
    const { focal } = run();
    expect(tooltip(focal.upfront)).toBe('$23,850 = $20,000 heaters + $3,850 install');
    expect(tooltip(focal.yearly)).toBe('$6,421/yr = $3,021 energy + $2,000 upkeep & replacement + $1,400 subscription');
    expect(tooltip(focal.fiveYear)).toBe('$55,955 = $23,850 upfront + 5 yrs × $6,421/yr');
    expect(tooltip(focal.fiveYearPerSeat)).toBe('$1,399 = $55,955 ÷ 40 seats');
    expect(tooltip(focal.yearlyPerSeat)).toBe('$161/yr = $6,421/yr ÷ 40 seats');
  });
});

// Numbers from the design prototype, which rounds weeks per month to 4.33 and
// predates the current tower and gas heater defaults, so those are pinned here.
const PROTOTYPE_ASSUMPTIONS: Partial<Assumptions> = { weeksPerMonth: 4.33, propaneTowerPrice: 560, propaneTowerLifespan: 4, gasHeaterPrice: 3_600 };
// Rows: units, heaters, install, energy, staff time, upkeep & replacement,
// subscription, upfront, yearly, first 5 years, and the three per-seat figures.
type Row = [number, number, number, number, number, number, number, number, number, number, number, number, number];
const PROTOTYPE: Record<string, { patio: Patio; assumptions?: Partial<Assumptions>; rows: Record<'focal' | 'propane' | 'gas' | 'electric', Row> }> = {
  'SF 40-seat patio, defaults': {
    patio: sfPatio,
    rows: {
      focal: [20, 20000, 3850, 3018.585, 0, 2000, 1400, 23850, 6418.585, 55942.9251, 1398.5731, 596.25, 160.4646],
      propane: [10, 5600, 0, 15754.2231, 7737.2928, 1400, 0, 5600, 24891.516, 130057.5798, 3251.4395, 140, 622.2879],
      gas: [7, 25200, 15050, 2153.5255, 0, 3220, 0, 40250, 5373.5255, 67117.6275, 1677.9407, 1006.25, 134.3381],
      electric: [7, 21000, 5250, 8384.9584, 0, 2450, 0, 26250, 10834.9584, 80424.792, 2010.6198, 656.25, 270.874],
    },
  },
  'Small 10-seat patio': {
    patio: { ...sfPatio, seats: 10 },
    rows: {
      focal: [5, 5000, 1100, 754.6463, 0, 500, 350, 6100, 1604.6463, 14123.2313, 1412.3231, 610, 160.4646],
      propane: [3, 1680, 0, 5251.4077, 2461.2254, 420, 0, 1680, 8132.6331, 42343.1655, 4234.3165, 168, 813.2633],
      gas: [2, 7200, 4300, 861.4102, 0, 920, 0, 11500, 1781.4102, 20407.051, 2040.7051, 1150, 178.141],
      electric: [2, 6000, 1500, 3353.9834, 0, 700, 0, 7500, 4053.9834, 27769.9168, 2776.9917, 750, 405.3983],
    },
  },
  'SF 40-seat patio at 15% occupancy': {
    patio: { ...sfPatio, occupancy: 0.15 },
    rows: {
      focal: [20, 20000, 3850, 754.6463, 0, 2000, 1400, 23850, 4154.6463, 44623.2313, 1115.5808, 596.25, 103.8662],
      propane: [10, 5600, 0, 5251.4077, 4936.5421, 1400, 0, 5600, 11587.9498, 63539.7488, 1588.4937, 140, 289.6987],
      gas: [7, 25200, 15050, 861.4102, 0, 3220, 0, 40250, 4081.4102, 60657.051, 1516.4263, 1006.25, 102.0353],
      electric: [7, 21000, 5250, 3353.9834, 0, 2450, 0, 26250, 5803.9834, 55269.9168, 1381.7479, 656.25, 145.0996],
    },
  },
  'Austin 64-seat patio, 5 nights a week, outlets and circuits in place': {
    patio: { seats: 64, occupancy: 0.75, heatingMonths: 5, daysPerWeek: 5, hoursPerDay: 5 },
    assumptions: { eveningElectricRate: 0.13, naturalGasRate: 0.75, has120VOutlets: true, has240VCircuits: true, propaneTankExchangePrice: 28 },
    rows: {
      focal: [32, 32000, 2200, 810.576, 0, 3200, 1600, 34200, 5610.576, 62252.88, 972.7013, 534.375, 87.6653],
      propane: [16, 8960, 0, 18004.8264, 7173.5301, 2240, 0, 8960, 27418.3565, 146051.7827, 2282.0591, 140, 428.4118],
      gas: [11, 39600, 19800, 1022.9625, 0, 5060, 0, 59400, 6082.9625, 89814.8125, 1403.3564, 928.125, 95.0463],
      electric: [11, 33000, 4400, 2026.44, 0, 3850, 0, 37400, 5876.44, 66782.2, 1043.4719, 584.375, 91.8194],
    },
  },
};

describe('matches the design prototype', () => {
  for (const [name, { patio, assumptions, rows }] of Object.entries(PROTOTYPE)) {
    it(name, () => {
      const results = run(patio, { ...PROTOTYPE_ASSUMPTIONS, ...assumptions });
      for (const [option, expected] of Object.entries(rows)) {
        const r = results[option as keyof typeof rows];
        const actual = [r.units, r.hardware, r.install, r.energy, r.staffTime, r.maintenance, r.subscription, r.upfront, r.yearly, r.fiveYear, r.fiveYearPerSeat, r.upfrontPerSeat, r.yearlyPerSeat]
          .map(x => (typeof x === 'number' ? x : x.value));
        actual.forEach((value, i) => expect(value, `${option} row ${i}`).toBeCloseTo(expected[i] ?? NaN, 2));
      }
    });
  }
});

describe('heaters on', () => {
  it('rounds up to whole heaters, as in the spec example', () => {
    const { electric } = run({ ...sfPatio, seats: 24, occupancy: 0.35 });
    expect(tooltip(electric.energy).split('\n\n')[0]).toBe('2 of 4 heaters on = ⌈4 × 35%⌉, rounded up to whole heaters');
  });

  it('does not round an exact count up a whole heater', () => {
    const { focal } = run({ ...sfPatio, seats: 20, occupancy: 0.7 });
    expect(tooltip(focal.energy).split('\n\n')[0]).toBe('7 of 10 Duos on = ⌈10 × 70%⌉, rounded up to whole heaters');
  });
});

describe('heating schedule', () => {
  it('multiplies heating months, days and hours', () => {
    const { focal } = run({ ...sfPatio, heatingMonths: 4, hoursPerDay: 14 });
    expect(tooltip(focal.energy).split('\n\n')[2]).toBe('1,699 hrs = 7 days/wk × 4 months × 4.33 wks/mo × 14 hrs/day');
  });
});

describe('revenue upside', () => {
  const estimate: Partial<RevenueInputs> = {
    averageCheck: 45,
    monthsClosed: 2,
    extraGuestsPerColdDay: 6,
    extraSpendPerGuest: 8,
  };

  it('explains each line with the visitor’s own numbers', () => {
    const { revenue } = run(sfPatio, {}, estimate);
    expect(tooltip(revenue.moreMonthsOpen!)).toBe(
      '$218,400/yr = 2 months × 4.33 wks/mo × 7 days/wk × 24 seats filled × (5 hrs ÷ 1.5 hr at the table) × $45 check',
    );
    expect(tooltip(revenue.moreGuestsSeated!)).toBe(
      [
        '$40,950/yr = 152 cold open days × 6 extra guests × $45 check',
        '152 cold open days = (7 heated months − 2 closed) × 4.33 wks/mo × 7 days/wk',
      ].join('\n\n'),
    );
    expect(tooltip(revenue.biggerChecks!).split('\n\n')[0]).toBe(
      '$97,067/yr = 152 cold open days × 24 seats filled × (5 hrs ÷ 1.5 hr at the table) × $8 extra spend',
    );
    expect(tooltip(revenue.total!)).toBe('$356,417/yr = $218,400 more months + $40,950 more guests + $97,067 bigger checks');
  });

  it('matches the design prototype', () => {
    const { revenue } = run(sfPatio, { weeksPerMonth: 4.33 }, estimate);
    expect(revenue.moreMonthsOpen?.value).toBeCloseTo(218232, 2);
    expect(revenue.moreGuestsSeated?.value).toBeCloseTo(40918.5, 2);
    expect(revenue.biggerChecks?.value).toBeCloseTo(96992, 2);
    expect(revenue.total?.value).toBeCloseTo(356142.5, 2);
  });

  it('leaves a line blank until its own input is filled, and totals only the filled lines', () => {
    const { revenue } = run(sfPatio, {}, { averageCheck: 45, extraGuestsPerColdDay: 6 });
    expect(revenue.moreMonthsOpen).toBeNull();
    expect(revenue.biggerChecks).toBeNull();
    expect(tooltip(revenue.moreGuestsSeated!).split('\n\n')[0]).toBe('$57,330/yr = 212 cold open days × 6 extra guests × $45 check');
    expect(tooltip(revenue.total!)).toBe('$57,330/yr = $57,330 more guests');
  });

  it('shows nothing before any estimate is entered', () => {
    const { revenue } = run();
    expect(revenue.total).toBeNull();
  });

  it('counts no more closed months than heating months', () => {
    const { revenue } = run({ ...sfPatio, heatingMonths: 1 }, {}, { averageCheck: 45, monthsClosed: 3 });
    expect(tooltip(revenue.moreMonthsOpen!).startsWith('$109,200/yr = 1 month ×')).toBe(true);
  });
});
