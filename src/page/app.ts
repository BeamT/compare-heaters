// Draws the page from the model and turns the visitor's input into state. No
// math happens here: numbers and tooltips come from the model as text.
import { MONTHS, type Month } from '../assumptions.ts';
import { hoursBetween } from '../calculate.ts';
import { lookupRates, type ZipRates } from '../rates.ts';
import { pageModel, type CostTable } from './model.ts';
import { parseQuery, toQuery, type Competitor, type PageState } from './state.ts';
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

function options<T extends string | number>(values: readonly T[], selected: T, label: (v: T) => string = String): string {
  return values.map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${esc(label(v))}</option>`).join('');
}

const infoButton = (tip: string, label: string) =>
  `<button type="button" class="info" data-tip="${esc(tip)}" aria-label="${esc(label)}">${icon('info')}</button>`;

function strip(state: PageState): string {
  const { season, heatingHours: hours } = state;
  return `<div class="strip"><div class="strip-row">
    <label class="field zip"><span class="field-label">ZIP</span>
      <input name="zip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]{5}" placeholder="94110" value="${esc(state.zip)}"></label>
    <div class="field utility" hidden></div>
    <label class="field seats"><span class="field-label">Seats on patio</span>
      <input name="seats" type="number" inputmode="numeric" min="1" step="1" placeholder="40" value="${state.seats ?? ''}"></label>
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

function costTable(t: CostTable): string {
  const add = t.hidden.length > 0;
  const cols = `<colgroup><col class="label">${t.columns.map(() => '<col>').join('')}${add ? '<col class="add">' : ''}</colgroup>`;
  const tab = ({ key, label }: CostTable['columns'][number]) =>
    key === 'focal'
      ? `<th scope="col" class="focal"><div class="tab focal">${label}</div></th>`
      : `<th scope="col"><div class="tab"><span>${esc(label)}</span><button type="button" class="remove" data-hide="${key}" aria-label="Remove ${esc(label)}" title="Remove ${esc(label)}">${icon('x')}</button></div></th>`;
  const addTabs = add
    ? `<th class="add"><div class="add-tabs">${t.hidden.map(({ key, label }) => `<button type="button" class="add-tab" data-show="${key}" title="Compare with ${esc(label)}">${icon('plus')}<span>${esc(label)}</span></button>`).join('')}</div></th>`
    : '';
  const addCell = add ? '<td class="add"></td>' : '';
  const focalClass = (i: number) => (t.columns[i]?.key === 'focal' ? ' class="focal"' : '');
  const body = t.sections
    .map(section => {
      const group = `<tr class="group"><td>${section.title}</td>${t.columns.map((_, i) => `<td${focalClass(i)}></td>`).join('')}${addCell}</tr>`;
      const rows = section.rows.map(row =>
        `<tr class="${row.kind}"><th scope="row">${esc(row.label)}</th>${row.cells
          .map((c, i) => `<td${focalClass(i)}><button type="button" class="value" data-tip="${esc(c.tip)}">${c.text}</button></td>`)
          .join('')}${addCell}</tr>`);
      return group + rows.join('');
    })
    .join('');
  return `<div class="scroll"><table class="cost">${cols}<thead><tr><th class="title condensed">Cost</th>${t.columns.map(tab).join('')}${addTabs}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="hint">Hover or tap any number to see its formula.</p>`;
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
  root.innerHTML = `${strip(state)}<div class="main"><div class="results" aria-live="polite"></div></div><div class="tip" role="tooltip" id="ch-tip" hidden></div>`;
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
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

  function render() {
    hideTip();
    $<HTMLElement>('.hours-per-night').textContent = `${hoursBetween(state.heatingHours)} hrs`;
    const zipRates = rates?.zip === state.zip && rates.value !== 'error' ? rates.value : undefined;
    const model = pageModel(state, zipRates);

    const utilities = model.kind === 'ready' ? model.utilities : [];
    utilityField.hidden = utilities.length < 2;
    const picker = utilities.length < 2 ? '' : `<label class="field-label" for="ch-utility">Utility</label><select id="ch-utility" name="utility">${options(utilities.map((_, i) => i), state.utility, i => utilities[i]!)}</select>`;
    if (utilityField.dataset.for !== picker) {
      utilityField.innerHTML = picker;
      utilityField.dataset.for = picker;
    }

    if (rates?.zip === state.zip && rates.value === 'error') {
      results.innerHTML = `<p class="status">Couldn't load energy rates for ${esc(state.zip)}. Check your connection and try again.</p>`;
    } else if (model.kind === 'missing') {
      const what = model.missing.map(m => (m === 'zip' ? 'your ZIP' : 'the seats on your patio')).join(' and ');
      results.innerHTML = `<p class="status">Enter ${what} to see your comparison.</p>`;
    } else if (model.kind === 'loading') {
      results.innerHTML = `<p class="status">Looking up energy rates for ${esc(state.zip)}…</p>`;
    } else {
      results.innerHTML = costTable(model.table);
    }
    history.replaceState(history.state, '', `${toQuery(state, location.search) || location.pathname}${location.hash}`);
  }

  function update(next: Partial<PageState>) {
    state = { ...state, ...next };
    fetchRates();
    render();
  }

  // ---- Inputs ----
  root.addEventListener('input', e => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const value = el.value;
    switch (el.name) {
      case 'zip': {
        const digits = value.replace(/\D/g, '').slice(0, 5);
        if (digits !== value) el.value = digits;
        const zip = digits.length === 5 ? digits : '';
        if (zip !== state.zip) update({ zip, utility: 0 });
        break;
      }
      case 'seats': {
        const seats = Number(value);
        update({ seats: Number.isInteger(seats) && seats >= 1 && seats <= 9999 ? seats : undefined });
        break;
      }
      case 'utility': return update({ utility: Number(value) });
      case 'occupancy': return update({ occupancy: Number(value) / 100 });
      case 'days': return update({ daysPerWeek: Number(value) });
      case 'seasonStart': return update({ season: { ...state.season, start: value as Month } });
      case 'seasonEnd': return update({ season: { ...state.season, end: value as Month } });
      case 'hoursStart': return update({ heatingHours: { ...state.heatingHours, start: Number(value) } });
      case 'hoursEnd': return update({ heatingHours: { ...state.heatingHours, end: Number(value) } });
    }
  });

  // ---- Show / hide columns ----
  root.addEventListener('click', e => {
    const button = (e.target as Element).closest<HTMLElement>('[data-hide], [data-show]');
    if (!button) return;
    const hide = button.dataset.hide as Competitor | undefined;
    const show = button.dataset.show as Competitor | undefined;
    const hidden = hide ? [...state.hidden, hide] : state.hidden.filter(c => c !== show);
    update({ hidden: (['propane', 'gas', 'electric'] as const).filter(c => hidden.includes(c)) });
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
