// Every default the calculator uses: its value, unit, a visitor-facing
// description and a short source. Changing a default means editing one line.

export const OPTIONS = ['focal', 'propane', 'gas', 'electric'] as const;
export type OptionKey = (typeof OPTIONS)[number];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export type Month = (typeof MONTHS)[number];
export interface MonthRange { start: Month; end: Month }
/** Hours since midnight (17 = 5 pm). */
export interface HourRange { start: number; end: number }

/** Facts about the visitor's own patio. */
export interface Patio {
  seats: number;
  /** Share of seats typically filled, 0–1. */
  occupancy: number;
  /** First and last heated month, inclusive; wraps across the new year. */
  season: MonthRange;
  daysPerWeek: number;
  /** When heaters run on a heated night. An end at or before the start runs past midnight. */
  heatingHours: HourRange;
}

export const PATIO_DEFAULTS: Omit<Patio, 'seats'> = {
  occupancy: 0.6,
  season: { start: 'Oct', end: 'Apr' },
  daysPerWeek: 7,
  heatingHours: { start: 17, end: 22 },
};

/** The visitor's own revenue estimate (vs. an unheated patio). Optional inputs stay blank. */
export interface RevenueInputs {
  averageCheck?: number;
  /** Hours a party stays at the table. */
  timeAtTable: number;
  /** Months the patio closes for cold today. */
  closedMonths?: MonthRange;
  extraGuestsPerColdNight?: number;
  extraSpendPerGuest?: number;
  /** What's kept from each extra dollar of sales, 0–1. */
  margin: number;
}

export const REVENUE_DEFAULTS: RevenueInputs = { timeAtTable: 1.5, margin: 0.4 };

/** The revenue inputs with defaults, described like the assumptions below; they show in the revenue section. */
export const REVENUE_ASSUMPTIONS = {
  timeAtTable: { label: 'Avg time at the table', unit: 'hr', source: 'Industry estimate', description: 'How long a party stays; sets how many times a seat turns over per night.' },
  margin: { label: 'Margin on extra sales', unit: '%', source: 'Focal estimate', description: 'Margin: what you keep from each extra dollar after food, drink and staff.' },
} as const;

export interface Assumptions {
  eveningElectricRate: number;
  naturalGasRate: number;
  newCircuitCost: number;
  has120VOutlets: boolean;
  installerRate: number;
  focalInstallHours: number;
  propaneTowerPrice: number;
  propaneTankExchangePrice: number;
  propaneTankSwapMinutes: number;
  propaneNightlySetupMinutes: number;
  staffHourlyCost: number;
  propaneTowerLifespan: number;
  propaneSeatsPerTower: number;
  propaneTowerOutput: number;
  gasHeaterPrice: number;
  gasLineCost: number;
  gasInstallHours: number;
  gasUpkeep: number;
  gasLifespan: number;
  gasSeatsPerHeater: number;
  gasHeaterOutput: number;
  has240VCircuits: boolean;
  electricHeaterPrice: number;
  electricInstallHours: number;
  electricUpkeep: number;
  electricLifespan: number;
  electricSeatsPerHeater: number;
  electricHeaterOutput: number;
  heatSetting: number;
  focalPrice: number;
  focalSubscription: number;
  focalLifespan: number;
  focalSeatsPerDuo: number;
  focalOutput: number;
  duosPerRail: number;
  weeksPerMonth: number;
  propaneLbPerTank: number;
  propaneBtuPerLb: number;
  btuPerTherm: number;
}

/** Rates come from the visitor's ZIP, so they have no fixed default. */
export type Rates = Pick<Assumptions, 'eveningElectricRate' | 'naturalGasRate'>;

interface AssumptionInfo<T> {
  label: string;
  unit: string;
  affects: readonly OptionKey[];
  /** panel = editable in the assumptions panel; tooltip = fixed, shown only in formula tooltips. */
  shown: 'panel' | 'tooltip';
  description?: string;
  source: string;
  /** Absent for values looked up by ZIP. */
  default?: T;
}

export const ASSUMPTIONS: { [K in keyof Assumptions]: AssumptionInfo<Assumptions[K]> } = {
  eveningElectricRate: { label: 'Evening electricity rate', unit: '$/kWh', affects: ['focal', 'electric'], shown: 'panel', source: 'NREL / EIA 2024 × 1.25 for evenings', description: 'What you pay per kWh during evening service. Use the rate from your bill if you know it.' },
  naturalGasRate: { label: 'Natural gas rate', unit: '$/therm', affects: ['gas'], shown: 'panel', source: 'EIA state commercial price', description: "What you pay per therm of gas. Use your bill's rate if you know it." },
  newCircuitCost: { label: 'New circuit cost', unit: '$/circuit', affects: ['focal', 'gas', 'electric'], shown: 'panel', default: 350, source: 'Industry estimate', description: 'A new electrical circuit, materials and labor. Focal needs one 120V outlet per rail; gas heaters need one 120V outlet per heater for ignition; conventional electric needs one 240V circuit per heater.' },
  has120VOutlets: { label: '120V outlets already in place', unit: '', affects: ['focal', 'gas'], shown: 'panel', default: false, source: 'Your patio', description: 'Check if the 120V outlets are already there: one per rail for Focal, one per heater for gas ignition. Sets the circuit cost to $0 for both.' },
  installerRate: { label: 'Installer rate', unit: '$/hr', affects: ['focal', 'gas', 'electric'], shown: 'panel', default: 100, source: 'Industry estimate', description: 'Hourly rate for whoever mounts and connects the heaters. Running new circuits or gas lines is priced separately.' },
  focalInstallHours: { label: 'Focal install time', unit: 'hrs/rail', affects: ['focal'], shown: 'panel', default: 2, source: 'Focal estimate', description: 'Installer hours per rail: mount the rail and slide the heaters on. Each rail plugs into a standard 120V outlet.' },
  propaneTowerPrice: { label: 'Propane tower & first tank price', unit: '$', affects: ['propane'], shown: 'panel', default: 560, source: 'Retail prices', description: 'Price of one tower plus its first filled tank; after that you exchange tanks.' },
  propaneTankExchangePrice: { label: 'Propane tank exchange price', unit: '$', affects: ['propane'], shown: 'panel', default: 25, source: 'Retail prices', description: 'What you pay per tank exchange. Exchange tanks hold about 15 lb of propane, not a full 20.' },
  propaneTankSwapMinutes: { label: 'Propane tank swap time', unit: 'min', affects: ['propane'], shown: 'panel', default: 20, source: 'Focal estimate', description: 'Staff time per tank: driving it to the exchange and back, then swapping it on the tower.' },
  propaneNightlySetupMinutes: { label: 'Nightly setup & breakdown', unit: 'min/tower', affects: ['propane'], shown: 'panel', default: 5, source: 'Focal estimate', description: 'Staff time per tower each night to light it and shut it down, plus moving or storing it if you do.' },
  staffHourlyCost: { label: 'Staff hourly cost', unit: '$/hr', affects: ['propane'], shown: 'panel', default: 20, source: 'Industry estimate', description: 'What an hour of staff time costs you; used for swapping tanks and setting up heaters.' },
  propaneTowerLifespan: { label: 'Propane tower lifespan', unit: 'yrs', affects: ['propane'], shown: 'panel', default: 4, source: 'Industry estimate', description: 'How long a tower lasts outdoors before you replace it. Replacement cost = tower price ÷ lifespan, per year.' },
  propaneSeatsPerTower: { label: 'Propane seats per tower', unit: 'seats', affects: ['propane'], shown: 'panel', default: 4, source: 'Industry estimate', description: 'How many seats one tower keeps warm; sets how many towers you need.' },
  propaneTowerOutput: { label: 'Propane tower output', unit: 'BTU/hr', affects: ['propane'], shown: 'panel', default: 40_000, source: 'Typical tower', description: 'How much heat one tower puts out at full blast.' },
  gasHeaterPrice: { label: 'Gas heater & mount price', unit: '$', affects: ['gas'], shown: 'panel', default: 3_600, source: 'Industry quotes', description: 'Price of one gas heater plus its mounting hardware and its share of the controls.' },
  gasLineCost: { label: 'Gas line cost', unit: '$/heater', affects: ['gas'], shown: 'panel', default: 1_200, source: 'Industry quotes', description: 'Running a gas line to each heater: line extension, shutoff valve and connector, pressure test, permits and inspection. Set to $0 if the lines are already run.' },
  gasInstallHours: { label: 'Gas heater install time', unit: 'hrs/heater', affects: ['gas'], shown: 'panel', default: 6, source: 'Focal estimate', description: 'Gas fitter hours per heater: mount the heater, connect it to the gas stub and its ignition power, test-fire it, plus its share of installing and wiring the control panel.' },
  gasUpkeep: { label: 'Gas heater upkeep', unit: '$/heater/yr', affects: ['gas'], shown: 'panel', default: 100, source: 'Industry estimate', description: 'Yearly service and repairs per heater.' },
  gasLifespan: { label: 'Gas heater lifespan', unit: 'yrs', affects: ['gas'], shown: 'panel', default: 10, source: 'Industry estimate', description: 'How long a gas heater lasts before you replace it.' },
  gasSeatsPerHeater: { label: 'Gas seats per heater', unit: 'seats', affects: ['gas'], shown: 'panel', default: 6, source: 'Industry estimate', description: 'How many seats one gas heater keeps warm.' },
  gasHeaterOutput: { label: 'Gas heater output', unit: 'BTU/hr', affects: ['gas'], shown: 'panel', default: 35_000, source: 'Typical heater', description: 'How much heat one gas heater puts out at full blast.' },
  has240VCircuits: { label: '240V circuits already in place', unit: '', affects: ['electric'], shown: 'panel', default: false, source: 'Your patio', description: "Check if each heater spot already has a 240V circuit (one per heater). Sets electric's circuit cost to $0. A 240V circuit can't power a Focal rail as-is, and a 120V outlet can't power a conventional electric heater." },
  electricHeaterPrice: { label: 'Electric heater & mount price', unit: '$', affects: ['electric'], shown: 'panel', default: 3_000, source: 'Industry quotes', description: 'Price of one heater plus its mounting hardware and its share of the controls.' },
  electricInstallHours: { label: 'Electric heater install time', unit: 'hrs/heater', affects: ['electric'], shown: 'panel', default: 4, source: 'Focal estimate', description: 'Electrician hours per heater: mount the heater, hardwire it to its 240V circuit, plus its share of installing and wiring the control panel.' },
  electricUpkeep: { label: 'Electric heater upkeep', unit: '$/heater/yr', affects: ['electric'], shown: 'panel', default: 50, source: 'Industry estimate', description: 'Yearly service and repairs per heater.' },
  electricLifespan: { label: 'Electric heater lifespan', unit: 'yrs', affects: ['electric'], shown: 'panel', default: 10, source: 'Industry estimate', description: 'How long an electric heater lasts before you replace it.' },
  electricSeatsPerHeater: { label: 'Electric seats per heater', unit: 'seats', affects: ['electric'], shown: 'panel', default: 6, source: 'Industry estimate', description: 'How many seats one electric heater keeps warm.' },
  electricHeaterOutput: { label: 'Electric heater output', unit: 'kW', affects: ['electric'], shown: 'panel', default: 4, source: 'Typical heater', description: 'How much power one electric heater draws at full blast.' },
  heatSetting: { label: 'Heat setting', unit: '', affects: OPTIONS, shown: 'tooltip', default: 0.8, source: 'Focal estimate', description: 'Share of full output heaters run at. Same for every option.' },
  focalPrice: { label: 'Focal price', unit: '$/Duo', affects: ['focal'], shown: 'tooltip', default: 1_000, source: 'Focal pricing' },
  focalSubscription: { label: 'Focal subscription (incl. maintenance)', unit: '$/Duo/mo', affects: ['focal'], shown: 'tooltip', default: 10, source: 'Focal pricing, billed only in heated months' },
  focalLifespan: { label: 'Focal heater lifespan', unit: 'yrs', affects: ['focal'], shown: 'tooltip', default: 10, source: 'Same as other electric heaters' },
  focalSeatsPerDuo: { label: 'Focal seats per Duo', unit: 'seats', affects: ['focal'], shown: 'tooltip', default: 2, source: 'Focal spec' },
  focalOutput: { label: 'Focal output', unit: 'kW', affects: ['focal'], shown: 'tooltip', default: 0.6, source: 'Focal spec' },
  duosPerRail: { label: 'Duos per rail', unit: '', affects: ['focal'], shown: 'tooltip', default: 3, source: 'Focal spec' },
  weeksPerMonth: { label: 'Weeks per month', unit: 'wks/mo', affects: OPTIONS, shown: 'tooltip', default: 52 / 12, source: '52 weeks ÷ 12 months' },
  propaneLbPerTank: { label: 'Propane per tank', unit: 'lb', affects: ['propane'], shown: 'tooltip', default: 15, source: 'Exchange tanks are filled to about 15 lb' },
  propaneBtuPerLb: { label: 'Propane BTU per lb', unit: 'BTU/lb', affects: ['propane'], shown: 'tooltip', default: 21_548, source: 'Physical constant' },
  btuPerTherm: { label: 'BTU per therm', unit: 'BTU/therm', affects: ['gas'], shown: 'tooltip', default: 100_000, source: 'Physical constant' },
};

/** Every default, with the visitor's ZIP-based rates filled in. */
export function defaultAssumptions(rates: Rates): Assumptions {
  const defaults = Object.fromEntries(
    Object.entries(ASSUMPTIONS).flatMap(([key, info]) => (info.default === undefined ? [] : [[key, info.default]])),
  );
  return { ...defaults, ...rates } as Assumptions;
}
