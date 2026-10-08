import { MONTHS, type Assumptions, type HourRange, type MonthRange, type OptionKey, type Patio, type RevenueInputs } from './assumptions.ts';
import { ceil, derive, div, explain, fixed, group, minus, plus, q, relabel, times, type Explained, type Formula, type Line } from './formula.ts';

export interface CalculatorInputs {
  patio: Patio;
  assumptions: Assumptions;
  revenue: RevenueInputs;
}

/** One column of the cost table. */
export interface OptionResult {
  /** Duos, towers or heaters. */
  units: number;
  hardware: Explained;
  install: Explained;
  upfront: Explained;
  upfrontPerSeat: Explained;
  energy: Explained;
  staffTime: Explained;
  maintenance: Explained;
  subscription: Explained;
  yearly: Explained;
  yearlyPerSeat: Explained;
  fiveYear: Explained;
  fiveYearPerSeat: Explained;
}

/** Extra sales from heating a patio that's cold today. A line is null until its own inputs are filled. */
export interface RevenueResult {
  closedMonths: number;
  /** Only closed months inside the heating season count. */
  closedMonthsInSeason: number;
  moreMonthsOpen: Explained | null;
  moreTablesSeated: Explained | null;
  biggerChecks: Explained | null;
  total: Explained | null;
  /** In heating seasons; null when it never pays for itself. */
  paysForItself: Explained | null;
}

export type Results = Record<OptionKey, OptionResult> & { revenue: RevenueResult };

type LineItems = Pick<OptionResult, 'hardware' | 'install' | 'energy' | 'staffTime' | 'maintenance' | 'subscription'>;

const YEARS = 5;

/** Months from start to end, inclusive, wrapping across the new year. */
export function monthsIn({ start, end }: MonthRange): number[] {
  const last = MONTHS.indexOf(end);
  const months = [MONTHS.indexOf(start)];
  while (months.at(-1) !== last) months.push(((months.at(-1) ?? 0) + 1) % 12);
  return months;
}

/** Hours from start to end; an end at or before the start runs past midnight. */
function hoursBetween({ start, end }: HourRange): number {
  return end > start ? end - start : end + 24 - start;
}

const usd = (value: number, label = '') => q(value, 'usd', label);
const count = (value: number, label = '') => q(value, 'count', label);
const num = (value: number, label = '') => q(value, 'number', label);

/** Energy tooltips open with the heaters-on line and close with the hours behind the energy. */
const energyRow = (on: Formula, energy: Formula, ...more: Line[]): Explained => ({ value: energy.result.value, lines: [on, energy, ...more] });

const NO_SUBSCRIPTION = fixed(0, 'No subscription.');
const WALL_CONTROL = fixed(0, 'Switched from a wall control: no staff time counted.');

export function calculate({ patio, assumptions: a, revenue: r }: CalculatorInputs): Results {
  const seats = count(patio.seats, 'seats');
  const seasonMonths = monthsIn(patio.season);
  const months = count(seasonMonths.length, 'months');
  const daysPerWeek = num(patio.daysPerWeek, 'days/wk');
  const weeksPerMonth = num(a.weeksPerMonth, 'wks/mo');
  const hoursPerNight = num(hoursBetween(patio.heatingHours), 'hrs/night');
  const nights = derive(times(daysPerWeek, months, weeksPerMonth), 'count', 'nights');
  const heaterHours = derive(times(daysPerWeek, months, weeksPerMonth, hoursPerNight), 'count', 'hrs');
  const occupancy = q(patio.occupancy, 'percent');
  const heatSetting = num(a.heatSetting, 'heat setting');
  const eveningRate = q(a.eveningElectricRate, 'rate', '/kWh');
  const installerRate = usd(a.installerRate, '/hr');
  const circuit120 = (label: string) => (a.has120VOutlets ? usd(0, `${label} — outlets in place`) : usd(a.newCircuitCost, label));
  const circuit240 = a.has240VCircuits ? usd(0, '240V circuit — circuits in place') : usd(a.newCircuitCost, '240V circuit');

  const unitsFor = (seatsPerUnit: number) => Math.ceil(patio.seats / seatsPerUnit);

  /** "12 of 20 Duos on": only the whole heaters seated guests need are on. */
  const heatersOn = (units: number, noun: string): Formula =>
    derive(ceil(times(count(units), occupancy)), 'count', `of ${units} ${noun} on`, 'rounded up to whole heaters');

  /** Adds the totals and per-seat rows to an option's line items. */
  function column(units: number, items: LineItems, yearlyParts: Array<[Explained, string]>): OptionResult {
    const upfront = derive(plus(usd(items.hardware.value, 'heaters'), usd(items.install.value, 'install')), 'usd');
    const yearly = derive(plus(...yearlyParts.map(([row, label]) => usd(row.value, label))), 'usd', '/yr');
    const fiveYear = derive(plus(relabel(upfront.result, 'upfront'), times(count(YEARS, 'yrs'), yearly.result)), 'usd');
    return {
      units,
      ...items,
      upfront: explain(upfront),
      upfrontPerSeat: explain(derive(div(upfront.result, seats), 'usd')),
      yearly: explain(yearly),
      yearlyPerSeat: explain(derive(div(yearly.result, seats), 'usd', '/yr')),
      fiveYear: explain(fiveYear),
      fiveYearPerSeat: explain(derive(div(fiveYear.result, seats), 'usd')),
    };
  }

  // Focal
  const duos = unitsFor(a.focalSeatsPerDuo);
  const rails = Math.ceil(duos / a.duosPerRail);
  const duosOn = heatersOn(duos, 'Duos');
  const focalPrice = usd(a.focalPrice);
  const focalItems: LineItems = {
    hardware: explain(derive(times(count(duos, 'Duos'), focalPrice), 'usd'), { text: 'Mounts included.' }),
    install: explain(derive(times(count(rails, 'rails'), plus(times(num(a.focalInstallHours, 'hrs'), installerRate), circuit120('circuit'))), 'usd')),
    energy: energyRow(
      duosOn,
      derive(times(relabel(duosOn.result, 'Duos on'), num(a.focalOutput, 'kW'), heaterHours.result, heatSetting, eveningRate), 'usd'),
      heaterHours,
    ),
    staffTime: fixed(0, 'Duos switch on and off by themselves: no tanks, no nightly setup.'),
    maintenance: explain(
      derive(div(times(count(duos, 'Duos'), focalPrice), num(a.focalLifespan, '-yr life')), 'usd'),
      { text: "Upkeep is covered by the subscription; replacement after warranty isn't." },
    ),
    subscription: explain(
      derive(times(count(duos, 'Duos'), usd(a.focalSubscription, '/mo'), relabel(months, 'heated months')), 'usd'),
      { text: 'Billed only in heated months; includes maintenance.' },
    ),
  };
  const focal = column(duos, focalItems, [
    [focalItems.energy, 'energy'],
    [focalItems.maintenance, 'maint. & replacement'],
    [focalItems.subscription, 'subscription'],
  ]);

  // Propane towers
  const towers = unitsFor(a.propaneSeatsPerTower);
  const towersOn = heatersOn(towers, 'towers');
  const towerPrice = usd(a.propaneTowerPrice);
  const tanks = derive(
    div(
      times(relabel(towersOn.result, 'towers on'), count(a.propaneTowerOutput, 'BTU/hr'), heaterHours.result, heatSetting),
      times(num(a.propaneLbPerTank, 'lb/tank'), count(a.propaneBtuPerLb, 'BTU/lb')),
    ),
    'tenths',
    'tanks',
  );
  const propaneItems: LineItems = {
    hardware: explain(derive(times(count(towers, 'towers'), relabel(towerPrice, 'tower & first tank')), 'usd')),
    install: fixed(0, 'Nothing to install: towers stand on the patio floor.'),
    energy: energyRow(towersOn, derive(times(tanks.result, usd(a.propaneTankExchangePrice, 'exchange')), 'usd'), tanks, heaterHours),
    staffTime: explain(derive(
      times(
        div(
          plus(
            times(tanks.result, num(a.propaneTankSwapMinutes, 'min')),
            times(count(towers, 'towers'), num(a.propaneNightlySetupMinutes, 'min'), nights.result),
          ),
          count(60),
        ),
        usd(a.staffHourlyCost, '/hr'),
      ),
      'usd',
    )),
    maintenance: explain(derive(div(times(count(towers, 'towers'), towerPrice), num(a.propaneTowerLifespan, '-yr life')), 'usd')),
    subscription: NO_SUBSCRIPTION,
  };
  const propane = column(towers, propaneItems, [
    [propaneItems.energy, 'energy'],
    [propaneItems.staffTime, 'staff time'],
    [propaneItems.maintenance, 'maint. & replacement'],
  ]);

  // Natural gas
  const gasHeaters = unitsFor(a.gasSeatsPerHeater);
  const gasOn = heatersOn(gasHeaters, 'heaters');
  const gasPrice = usd(a.gasHeaterPrice);
  const gasItems: LineItems = {
    hardware: explain(derive(times(count(gasHeaters, 'heaters'), relabel(gasPrice, 'heater, mount & controls share')), 'usd')),
    install: explain(derive(
      times(count(gasHeaters, 'heaters'), plus(times(num(a.gasInstallHours, 'hrs'), installerRate), circuit120('ignition circuit'), usd(a.gasLineCost, 'gas line'))),
      'usd',
    )),
    energy: energyRow(
      gasOn,
      derive(
        times(
          div(times(relabel(gasOn.result, 'heaters on'), count(a.gasHeaterOutput, 'BTU/hr'), heaterHours.result, heatSetting), count(a.btuPerTherm, 'BTU/therm')),
          q(a.naturalGasRate, 'rate', '/therm'),
        ),
        'usd',
      ),
      heaterHours,
    ),
    staffTime: WALL_CONTROL,
    maintenance: explain(derive(times(count(gasHeaters, 'heaters'), plus(usd(a.gasUpkeep, 'upkeep'), div(gasPrice, num(a.gasLifespan, '-yr life')))), 'usd')),
    subscription: NO_SUBSCRIPTION,
  };
  const gas = column(gasHeaters, gasItems, [
    [gasItems.energy, 'energy'],
    [gasItems.maintenance, 'maint. & replacement'],
  ]);

  // Conventional electric
  const electricHeaters = unitsFor(a.electricSeatsPerHeater);
  const electricOn = heatersOn(electricHeaters, 'heaters');
  const electricPrice = usd(a.electricHeaterPrice);
  const electricItems: LineItems = {
    hardware: explain(derive(times(count(electricHeaters, 'heaters'), relabel(electricPrice, 'heater, mount & controls share')), 'usd')),
    install: explain(derive(times(count(electricHeaters, 'heaters'), plus(times(num(a.electricInstallHours, 'hrs'), installerRate), circuit240)), 'usd')),
    energy: energyRow(
      electricOn,
      derive(times(relabel(electricOn.result, 'heaters on'), num(a.electricHeaterOutput, 'kW'), heaterHours.result, heatSetting, eveningRate), 'usd'),
      heaterHours,
    ),
    staffTime: WALL_CONTROL,
    maintenance: explain(derive(times(count(electricHeaters, 'heaters'), plus(usd(a.electricUpkeep, 'upkeep'), div(electricPrice, num(a.electricLifespan, '-yr life')))), 'usd')),
    subscription: NO_SUBSCRIPTION,
  };
  const electric = column(electricHeaters, electricItems, [
    [electricItems.energy, 'energy'],
    [electricItems.maintenance, 'maint. & replacement'],
  ]);

  // Revenue upside, vs. an unheated patio
  const closed = r.closedMonths ? monthsIn(r.closedMonths) : [];
  const closedInSeason = closed.filter(m => seasonMonths.includes(m)).length;
  const seatsFilled = num(patio.seats * patio.occupancy, 'seats filled');
  const turns = group(div(relabel(hoursPerNight, 'hrs'), num(r.timeAtTable, 'hr at the table')));
  const check = r.averageCheck === undefined ? undefined : usd(r.averageCheck, 'check');
  const coldOpenNights = derive(
    times(group(minus(relabel(months, 'heated months'), count(closedInSeason, 'closed'))), weeksPerMonth, daysPerWeek),
    'count',
    'cold open nights',
  );
  const moreMonthsOpen = check && r.closedMonths
    ? explain(derive(times(count(closedInSeason, closedInSeason === 1 ? 'month' : 'months'), weeksPerMonth, daysPerWeek, seatsFilled, turns, check), 'usd', '/yr'))
    : null;
  const moreTablesSeated = check && r.extraGuestsPerColdNight !== undefined
    ? explain(derive(times(coldOpenNights.result, num(r.extraGuestsPerColdNight, 'extra guests'), check), 'usd', '/yr'), coldOpenNights)
    : null;
  const biggerChecks = r.extraSpendPerGuest !== undefined
    ? explain(derive(times(coldOpenNights.result, seatsFilled, turns, usd(r.extraSpendPerGuest, 'extra spend')), 'usd', '/yr'), coldOpenNights)
    : null;
  const lines = ([[moreMonthsOpen, 'more months'], [moreTablesSeated, 'more tables'], [biggerChecks, 'bigger checks']] as const)
    .flatMap(([line, label]) => (line ? [usd(line.value, label)] : []));
  const total = lines.length ? derive(plus(...lines), 'usd', '/yr') : null;
  const paysForItself = total && derive(
    div(
      usd(focal.upfront.value, 'Focal upfront'),
      minus(times(relabel(total.result, ''), q(r.margin, 'percent', 'margin')), usd(focal.yearly.value, 'Focal yearly cost')),
    ),
    'tenths',
    'heating seasons',
  );

  return {
    focal,
    propane,
    gas,
    electric,
    revenue: {
      closedMonths: closed.length,
      closedMonthsInSeason: closedInSeason,
      moreMonthsOpen,
      moreTablesSeated,
      biggerChecks,
      total: total && explain(total),
      // Negative or infinite when the margin on extra sales doesn't cover Focal's yearly cost.
      paysForItself: paysForItself && Number.isFinite(paysForItself.result.value) && paysForItself.result.value > 0 ? explain(paysForItself) : null,
    },
  };
}
