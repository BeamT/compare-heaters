// Draws the page from the model and turns the visitor's input into state. The
// page never redoes the math: numbers and tooltips come from the model as text.
import { MONTHS, REVENUE_ASSUMPTIONS, type Month } from '../assumptions.ts';
import { hoursBetween } from '../calculate.ts';
import { lookupRates, type ZipRates } from '../rates.ts';
import { morph } from './morph.ts';
import { pageModel, type Cell, type CostTable, type Experience, type Panel, type PanelRow, type Revenue } from './model.ts';
import { COMPETITORS, MAX_SEATS, parseQuery, setParam, toQuery, type Competitor, type PageState, type PanelTab } from './state.ts';
import css from './styles.css?inline';

export interface MountOptions {
  /** Where the rate snapshot's files are, e.g. https://example.com/rates/. */
  ratesUrl: URL;
}

const OCCUPANCY_TIP = 'Only the heaters your guests need are on, rounded up to whole heaters. A Focal Duo covers 2 seats; other heaters cover 4–6, so a few guests keep a whole heater running.';
const HOURS_TIP = "Just the hours you'd run heaters. A patio open at lunch often doesn't need heat.";

const ICONS = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.01"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  dash: '<path d="M7 12h10"/>',
};
const icon = (name: keyof typeof ICONS) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 17.5 → "5:30 pm". */
function clock(hour: number): string {
  const h = Math.floor(hour) % 24;
  const minutes = hour % 1 ? ':30' : '';
  return `${h % 12 || 12}${minutes} ${h < 12 ? 'am' : 'pm'}`;
}

/** Every half hour, starting mid-morning so evening service reads in order. */
const TIMES = Array.from({ length: 48 }, (_, i) => (10 + i / 2) % 24);
const OCCUPANCIES = Array.from({ length: 19 }, (_, i) => 10 + i * 5);
const DAYS = [1, 2, 3, 4, 5, 6, 7];

function options<T extends string | number>(values: readonly T[], selected: T | undefined, label: (v: T) => string = String): string {
  return values.map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${esc(label(v))}</option>`).join('');
}

const infoButton = (tip: string, label: string) =>
  `<button type="button" class="info" data-tip="${esc(tip)}" aria-label="${esc(label)}">${icon('info')}</button>`;

function strip(state: PageState): string {
  const { season, heatingHours: hours } = state;
  return `<div class="strip"><div class="strip-row">
    <label class="field zip"><span class="field-label">ZIP</span>
      <input name="zip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]{5}" placeholder="Required" value="${esc(state.zip)}"></label>
    <div class="field utility" hidden></div>
    <label class="field seats"><span class="field-label">Seats on patio</span>
      <input name="seats" type="number" inputmode="numeric" min="1" step="1" placeholder="Required" value="${state.seats ?? ''}"></label>
    <div class="field occupancy"><span class="field-label"><label for="ch-occupancy">Occupancy %</label> ${infoButton(OCCUPANCY_TIP, 'About occupancy')}</span>
      <select id="ch-occupancy" name="occupancy">${options(OCCUPANCIES, Math.round(state.occupancy * 100))}</select></div>
    <div class="field" role="group" aria-labelledby="ch-season"><span class="field-label" id="ch-season">Heating season</span>
      <div class="pair"><select class="month" name="seasonStart" aria-label="Season starts">${options(MONTHS, season.start)}</select><span>to</span>
      <select class="month" name="seasonEnd" aria-label="Season ends">${options(MONTHS, season.end)}</select></div></div>
    <label class="field days"><span class="field-label">Days/wk</span><select name="days">${options(DAYS, state.daysPerWeek)}</select></label>
    <div class="field" role="group" aria-labelledby="ch-hours"><span class="field-label"><span id="ch-hours">Heating hours</span> · <b class="hours-per-night"></b> ${infoButton(HOURS_TIP, 'About heating hours')}</span>
      <div class="pair"><select class="time" name="hoursStart" aria-label="Heaters on at">${options(TIMES, hours.start, clock)}</select><span>to</span>
      <select class="time" name="hoursEnd" aria-label="Heaters off at">${options(TIMES, hours.end, clock)}</select></div></div>
  </div></div>`;
}

/**
 * The cost and experience tables share one column grid, so their columns line
 * up. Only the cost table's header removes (✕) and adds (+) columns.
 */
function grid(t: CostTable, title: string, interactive: boolean) {
  const add = t.hidden.length > 0;
  const cols = `<colgroup><col class="label">${t.columns.map(() => '<col>').join('')}${add ? '<col class="add">' : ''}</colgroup>`;
  const tab = ({ key, label }: CostTable['columns'][number]) =>
    key === 'focal'
      ? `<th scope="col" class="focal"><div class="tab focal">${esc(label)}</div></th>`
      : interactive
        ? `<th scope="col"><div class="tab"><span>${esc(label)}</span><button type="button" class="remove" data-hide="${key}" aria-label="Remove ${esc(label)}" title="Remove ${esc(label)}">${icon('x')}</button></div></th>`
        : `<th scope="col"><div class="tab static">${esc(label)}</div></th>`;
  const addTabs = !add
    ? ''
    : interactive
      ? `<th class="add"><div class="add-tabs">${t.hidden.map(({ key, label }) => `<button type="button" class="add-tab" data-show="${key}" title="Compare with ${esc(label)}">${icon('plus')}<span>${esc(label)}</span></button>`).join('')}</div></th>`
      : '<th class="add"></th>';
  return {
    head: `${cols}<thead><tr><th class="title condensed">${title}</th>${t.columns.map(tab).join('')}${addTabs}</tr></thead>`,
    addCell: add ? '<td class="add"></td>' : '',
    focalClass: (i: number) => (t.columns[i]?.key === 'focal' ? ' class="focal"' : ''),
  };
}

/** A number that opens its formula. */
const value = (c: Cell) => (c.tip ? `<button type="button" class="value" data-tip="${esc(c.tip)}">${esc(c.text)}</button>` : `<span class="value blank">${esc(c.text)}</span>`);

function costTable(t: CostTable): string {
  const { head, addCell, focalClass } = grid(t, 'Cost', true);
  const body = t.sections
    .map(section => {
      const group = `<tr class="group"><td>${esc(section.title)}</td>${t.columns.map((_, i) => `<td${focalClass(i)}></td>`).join('')}${addCell}</tr>`;
      const rows = section.rows.map(row =>
        `<tr class="${row.kind}"><th scope="row">${esc(row.label)}</th>${row.cells.map((c, i) => `<td${focalClass(i)}>${value(c)}</td>`).join('')}${addCell}</tr>`);
      return group + rows.join('');
    })
    .join('');
  return `<div><div class="scroll"><table class="grid cost">${head}<tbody>${body}</tbody></table></div>
    <p class="hint">Hover or tap any number to see its formula.</p></div>`;
}

const YES = `<span class="yes" role="img" aria-label="Yes">${icon('check')}</span>`;
const NO = `<span class="no" role="img" aria-label="No">${icon('dash')}</span>`;

function experience(t: CostTable, e: Experience): string {
  const { head, addCell, focalClass } = grid(t, 'Experience', false);
  const body = e.rows
    .map(row =>
      `<tr><th scope="row">${esc(row.label)}</th>${row.checks
        .map((check, i) => `<td${focalClass(i)}>${check ? YES : NO}${t.columns[i]?.key === 'focal' ? `<span class="how">${esc(row.how)}</span>` : ''}</td>`)
        .join('')}${addCell}</tr>`)
    .join('');
  return `<section class="experience"><div class="scroll"><table class="grid experience">${head}<tbody>${body}</tbody></table></div></section>`;
}

/** A number input named after its link parameter. */
const numberInput = (name: string, value: number | undefined, { label, step = 'any', placeholder = '' }: { label: string; step?: string; placeholder?: string }) =>
  `<input name="${name}" type="number" inputmode="decimal" min="0" step="${step}" value="${value ?? ''}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}">`;
const unit = (text: string) => `<span class="unit">${esc(text)}</span>`;
/** A row label with its "what it is" line under it. */
const described = (label: string, description: string) => `${esc(label)}<span class="description">${esc(description)}</span>`;

function revenue(state: PageState, r: Revenue): string {
  const heat = (answer: boolean, label: string) =>
    `<button type="button" data-heat="${answer ? 'yes' : 'no'}" aria-pressed="${state.heatToday === answer}">${label}</button>`;
  const intro = `<h2 class="condensed">Revenue upside</h2>
    <p class="lede">Extra sales from heating a patio that's cold today.</p>
    <div class="question" role="group" aria-labelledby="ch-heat"><span id="ch-heat">Do you heat your patio today?</span><span class="segmented">${heat(true, 'Yes')}${heat(false, 'No')}</span></div>`;
  if (!r.open) return `<section class="card revenue">${intro}</section>`;

  const { revenue: inputs } = state;
  const closed = inputs.closedMonths;
  const closedPicker = `<span class="pair"><select name="closedStart" aria-label="Closed from"><option value=""${closed ? '' : ' selected'}>None</option>${options(MONTHS, closed?.start)}</select>${
    closed ? `${unit('to')}<select name="closedEnd" aria-label="Closed until">${options(MONTHS, closed.end)}</select>` : ''}</span>`;
  const group = (title: string) => `<tr class="group"><td colspan="3">${title}</td></tr>`;
  const row = (label: string, description: string, input: string, cell?: Cell, cls = '') =>
    `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${described(label, description)}</th><td class="input">${input}</td><td class="number">${cell ? value(cell) : ''}</td></tr>`;
  return `<section class="card revenue">${intro}
    <table class="lines">
      ${group('About your guests')}
      ${row('Average check per guest', 'What one guest spends on average.', `${unit('$')}${numberInput('check', inputs.averageCheck, { label: 'Average check per guest', placeholder: 'Required' })}`, undefined, 'shared')}
      ${row(REVENUE_ASSUMPTIONS.timeAtTable.label, REVENUE_ASSUMPTIONS.timeAtTable.description, `${numberInput('table', inputs.timeAtTable, { label: REVENUE_ASSUMPTIONS.timeAtTable.label, step: '0.25' })}${unit('hr')}`, undefined, 'shared')}
      ${group('Your estimate')}
      ${row('More months open', 'Months your patio closes for cold today. Only months inside your heating season count.', closedPicker, r.moreMonthsOpen)}
      ${row('More tables seated', "Guests you turn away, or who won't sit outside, on a cold night you're open.", `${numberInput('guests', inputs.extraGuestsPerColdNight, { label: 'Extra guests on a cold night', placeholder: 'e.g. 6' })}${unit('extra guests / cold night')}`, r.moreTablesSeated)}
      ${row('Bigger checks', 'What a warm guest adds by staying longer: one more drink or a dessert.', `${numberInput('spend', inputs.extraSpendPerGuest, { label: 'Extra spend per guest', placeholder: 'e.g. 8' })}${unit('$ extra per guest')}`, r.biggerChecks)}
      <tr class="total"><th scope="row">Total revenue upside</th><td class="input"></td><td class="number">${value(r.total)}</td></tr>
      ${row('Focal pays for itself in', REVENUE_ASSUMPTIONS.margin.description, `${numberInput('margin', Math.round(inputs.margin * 100), { label: REVENUE_ASSUMPTIONS.margin.label, step: '1' })}${unit('% margin on sales')}`, r.paysForItself)}
    </table>
    ${r.warning ? `<p class="warning">${esc(r.warning)}</p>` : ''}
  </section>`;
}

/** Spinner steps that suit each unit; any value can still be typed. */
const STEPS: Record<string, string> = { '$/kWh': '0.01', '$/therm': '0.01', 'hrs/rail': '0.5', 'hrs/heater': '0.5', 'BTU/hr': '1000', kW: '0.5' };

function panel(p: Panel): string {
  const tabs = p.tabs
    .map(t => `<button type="button" data-tab="${t.key}" aria-pressed="${t.selected}">${esc(t.label)}</button>`)
    .join('');
  const input = (r: PanelRow) =>
    typeof r.value === 'boolean'
      ? `<input name="${r.key}" type="checkbox"${r.value ? ' checked' : ''} aria-label="${esc(r.label)}">`
      : `${numberInput(r.key, r.value, { label: r.label, step: STEPS[r.unit] ?? '1' })}${r.unit ? unit(r.unit) : ''}`;
  const affects = (r: PanelRow) =>
    r.affects.length
      ? `<span class="affects-label">${p.affectsHeading}</span>${r.affects.map(a => `<span class="chip${a.key === 'focal' ? ' focal' : ''}">${esc(a.label)}</span>`).join('')}`
      : `<span class="no" role="img" aria-label="None">${icon('dash')}</span>`;
  const row = (r: PanelRow) =>
    `<tr><th scope="row">${esc(r.label)}${r.tag ? `<span class="source">${esc(r.tag)}</span>` : ''}</th><td class="input">${input(r)}</td><td class="affects">${affects(r)}</td><td class="description">${esc(r.description)}</td></tr>`;
  const body = p.groups.map(g => `${g.title ? `<tr class="group"><td colspan="4">${esc(g.title)}</td></tr>` : ''}${g.rows.map(row).join('')}`).join('');
  return `<section class="card panel"><h2 class="condensed">How we calculated this</h2>
    <p class="lede">The defaults behind what you're comparing. Change any you know better, like the rate on your bill.</p>
    <div class="tabs" role="group" aria-label="Show assumptions for">${tabs}</div>
    <table class="sheet"><thead><tr><th scope="col">Assumption</th><th scope="col">Value</th><th scope="col">${p.affectsHeading}</th><th scope="col">What it is</th></tr></thead><tbody>${body}</tbody></table>
  </section>`;
}

/** Starts the calculator inside `root`. */
export function mount(root: HTMLElement, { ratesUrl }: MountOptions): void {
  if (!document.querySelector('style[data-compare-heaters]')) {
    const style = document.createElement('style');
    style.dataset.compareHeaters = '';
    style.textContent = css;
    document.head.append(style);
  }

  let state = parseQuery(location.search);
  /** The rates for state.zip once loaded; 'error' when the lookup failed. */
  let rates: { zip: string; value: ZipRates | 'error' } | undefined;

  root.classList.add('ch');
  root.innerHTML = `${strip(state)}<div class="main"><div class="status" aria-live="polite"></div><div class="results"></div></div><div class="tip" role="tooltip" id="ch-tip" hidden></div>`;
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const status = $<HTMLElement>('.status');
  const results = $<HTMLElement>('.results');
  const utilityField = $<HTMLElement>('.field.utility');
  const tip = $<HTMLElement>('.tip');

  const load = async (file: string) => {
    const response = await fetch(new URL(file, ratesUrl));
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${file}: ${response.status}`);
    return response.json();
  };

  function fetchRates() {
    const { zip } = state;
    if (!zip || rates?.zip === zip) return;
    rates = undefined;
    lookupRates(zip, load).then(
      value => { if (state.zip === zip) { rates = { zip, value }; render(); } },
      () => { if (state.zip === zip) { rates = { zip, value: 'error' }; render(); } },
    );
  }

  /** A status message (announced to screen readers), or the results. Patched in place, so the field being typed in keeps its focus and value. */
  function show(message: string, html = '') {
    morph(status, message && `<p>${message}</p>`);
    morph(results, html);
  }

  function render() {
    hideTip();
    $<HTMLElement>('.hours-per-night').textContent = `${hoursBetween(state.heatingHours)} hrs`;
    const zipRates = rates?.zip === state.zip && rates.value !== 'error' ? rates.value : undefined;
    const model = pageModel(state, zipRates);

    const utilities = model.kind === 'ready' ? model.utilities : [];
    utilityField.hidden = utilities.length < 2;
    const picker = utilities.length < 2 ? '' : `<label class="field-label" for="ch-utility">Utility</label><select id="ch-utility" name="utility">${options(utilities, state.utility || utilities[0]!)}</select>`;
    if (utilityField.dataset.for !== picker) {
      utilityField.innerHTML = picker;
      utilityField.dataset.for = picker;
    }

    if (rates?.zip === state.zip && rates.value === 'error') {
      show(`Couldn't load energy rates for ${esc(state.zip)}. Check your connection and <button type="button" class="retry">try again</button>.`);
    } else if (model.kind === 'missing') {
      const what = model.missing.map(m => (m === 'zip' ? 'your ZIP' : 'the seats on your patio')).join(' and ');
      show(`Enter ${what} to see your comparison.`);
    } else if (model.kind === 'loading') {
      show(`Looking up energy rates for ${esc(state.zip)}…`);
    } else {
      show('', costTable(model.table) + experience(model.table, model.experience) + revenue(state, model.revenue) + panel(model.panel));
    }
    history.replaceState(history.state, '', `${toQuery(state, location.search) || location.pathname}${location.hash}`);
  }

  function update(next: Partial<PageState>) {
    state = { ...state, ...next };
    fetchRates();
    render();
  }

  /** A ZIP's or utility's own rates replace any the visitor typed for the last one. */
  const withoutRates = ({ eveningElectricRate, naturalGasRate, ...rest }: PageState['overrides'], keepGas = false) =>
    keepGas && naturalGasRate !== undefined ? { ...rest, naturalGasRate } : rest;

  // ---- Inputs ----
  root.addEventListener('input', e => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (results.contains(el)) return estimate(el);
    const value = el.value;
    switch (el.name) {
      case 'zip': {
        const digits = value.replace(/\D/g, '').slice(0, 5);
        if (digits !== value) el.value = digits;
        const zip = digits.length === 5 ? digits : '';
        if (zip !== state.zip) update({ zip, utility: '', overrides: withoutRates(state.overrides) });
        break;
      }
      case 'seats': {
        const seats = Number(value);
        update({ seats: Number.isInteger(seats) && seats >= 1 && seats <= MAX_SEATS ? seats : undefined });
        break;
      }
      case 'utility': return update({ utility: value, overrides: withoutRates(state.overrides, true) });
      case 'occupancy': return update({ occupancy: Number(value) / 100 });
      case 'days': return update({ daysPerWeek: Number(value) });
      case 'seasonStart': return update({ season: { ...state.season, start: value as Month } });
      case 'seasonEnd': return update({ season: { ...state.season, end: value as Month } });
      case 'hoursStart': return update({ heatingHours: { ...state.heatingHours, start: Number(value) } });
      case 'hoursEnd': return update({ heatingHours: { ...state.heatingHours, end: Number(value) } });
    }
  });

  /** The revenue estimate's and the assumptions panel's fields, each named after its link parameter. */
  function estimate(el: HTMLInputElement | HTMLSelectElement) {
    if (el.name === 'closedStart' || el.name === 'closedEnd') {
      const start = el.name === 'closedStart' ? el.value : state.revenue.closedMonths?.start;
      const end = el.name === 'closedEnd' ? el.value : (state.revenue.closedMonths?.end ?? start);
      state = setParam(state, 'closed', start ? `${start}-${end}` : '');
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      state = setParam(state, el.name, el.checked ? 'yes' : 'no');
    } else {
      state = setParam(state, el.name, el.value.trim());
    }
    render();
  }

  // ---- Show / hide columns, panel tabs, the revenue question, and retrying a failed rate lookup ----
  root.addEventListener('click', e => {
    const target = e.target as Element;
    if (target.closest('.retry')) {
      rates = undefined;
      return update({});
    }
    const tab = target.closest<HTMLElement>('[data-tab]')?.dataset.tab;
    if (tab) return update({ tab: tab as PanelTab });
    const heat = target.closest<HTMLElement>('[data-heat]')?.dataset.heat;
    if (heat) return update({ heatToday: heat === 'yes' });
    const button = target.closest<HTMLElement>('[data-hide], [data-show]');
    if (!button) return;
    const hide = button.dataset.hide as Competitor | undefined;
    const show = button.dataset.show as Competitor | undefined;
    const hidden = hide ? [...state.hidden, hide] : state.hidden.filter(c => c !== show);
    update({ hidden: COMPETITORS.filter(c => hidden.includes(c)) });
    // Keep keyboard focus in the header after its buttons are redrawn.
    root.querySelector<HTMLElement>(show ? `[data-hide="${show}"]` : `[data-show="${hide}"]`)?.focus();
  });

  // ---- Formula tooltips: hover on desktop, tap on phones, focus from the keyboard ----
  let anchor: HTMLElement | undefined;
  /** Opened by a tap or click, so it stays until the next tap. */
  let pinned = false;

  function showTip(el: HTMLElement, pin: boolean) {
    if (anchor && anchor !== el) anchor.removeAttribute('aria-describedby');
    anchor = el;
    pinned = pin;
    tip.textContent = el.dataset.tip ?? '';
    tip.hidden = false;
    el.setAttribute('aria-describedby', tip.id);
    const box = root.getBoundingClientRect();
    const target = el.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const left = Math.max(8, Math.min(target.right - box.left - width, box.width - width - 8));
    // Below the number, unless there's only room above it.
    const below = target.bottom + 6 + height <= window.innerHeight || target.top - 6 - height < 0;
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? target.bottom - box.top + 6 : target.top - box.top - 6 - height}px`;
  }

  function hideTip() {
    anchor?.removeAttribute('aria-describedby');
    anchor = undefined;
    pinned = false;
    tip.hidden = true;
  }

  const tipTarget = (e: Event) => (e.target as Element).closest<HTMLElement>('[data-tip]');
  root.addEventListener('pointerover', e => {
    const el = tipTarget(e);
    if (e.pointerType === 'mouse' && el && !pinned) showTip(el, false);
  });
  root.addEventListener('pointerout', e => {
    if (e.pointerType === 'mouse' && !pinned && tipTarget(e) === anchor && !anchor?.contains(e.relatedTarget as Node)) hideTip();
  });
  root.addEventListener('focusin', e => { const el = tipTarget(e); if (el) showTip(el, false); });
  root.addEventListener('focusout', e => { if (tipTarget(e) === anchor && !pinned) hideTip(); });
  root.addEventListener('click', e => {
    const el = tipTarget(e);
    if (el && !(el === anchor && pinned)) showTip(el, true);
    else hideTip();
  });
  document.addEventListener('click', e => { if (anchor && !root.contains(e.target as Node)) hideTip(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  // A tooltip would drift from its number when the table scrolls sideways.
  root.addEventListener('scroll', () => hideTip(), true);
  window.addEventListener('resize', () => hideTip());

  fetchRates();
  render();
}
