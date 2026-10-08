// A calculated value carries the formula behind it, and the value is evaluated
// from that formula, so a tooltip can never disagree with its number.

/** How a number is written in a tooltip. */
export type Format =
  | 'usd' // $3,021
  | 'rate' // $0.494, $1.45
  | 'count' // 1,062
  | 'number' // 0.6, 4.33
  | 'tenths' // 0.2
  | 'percent'; // 60%

/** A number as it appears in a formula: its value, how to write it and what follows it ("Duos on", "/kWh"). */
export interface Quantity {
  value: number;
  format: Format;
  label: string;
}

export type Expr =
  | Quantity
  | { op: '×' | '÷' | '+' | '−'; terms: Expr[] }
  | { ceil: Expr }
  | { group: Expr };

/** One line of a tooltip: "result = expression[, note]". */
export interface Formula {
  result: Quantity;
  expr: Expr;
  note?: string;
}

export type Line = Formula | { text: string };

/** A calculated number and the tooltip lines that explain it. */
export interface Explained {
  value: number;
  lines: Line[];
}

export const q = (value: number, format: Format, label = ''): Quantity => ({ value, format, label });
export const times = (...terms: Expr[]): Expr => ({ op: '×', terms });
export const div = (...terms: Expr[]): Expr => ({ op: '÷', terms });
export const plus = (...terms: Expr[]): Expr => ({ op: '+', terms });
export const minus = (...terms: Expr[]): Expr => ({ op: '−', terms });
export const ceil = (inner: Expr): Expr => ({ ceil: inner });
export const group = (inner: Expr): Expr => ({ group: inner });

/** The same number under another label, e.g. "12 of 20 Duos on" reused as "12 Duos on". */
export const relabel = (quantity: Quantity, label: string): Quantity => ({ ...quantity, label });

// Products like 10 × 70% come out as 7.000000000000001 in floating point;
// rounding up must still give 7.
const CEIL_TOLERANCE = 1e-9;

export function evaluate(expr: Expr): number {
  if ('value' in expr) return expr.value;
  if ('ceil' in expr) return Math.ceil(evaluate(expr.ceil) - CEIL_TOLERANCE);
  if ('group' in expr) return evaluate(expr.group);
  const [first, ...rest] = expr.terms.map(evaluate);
  if (first === undefined) throw new Error(`empty ${expr.op}`);
  return rest.reduce((acc, x) => {
    switch (expr.op) {
      case '×': return acc * x;
      case '÷': return acc / x;
      case '+': return acc + x;
      case '−': return acc - x;
    }
  }, first);
}

/** A formula line whose result is evaluated from its expression. */
export function derive(expr: Expr, format: Format, label = '', note?: string): Formula {
  return { result: q(evaluate(expr), format, label), expr, ...(note === undefined ? {} : { note }) };
}

/** A value explained by its formula, plus any further lines (the hours behind it, a note). */
export function explain(formula: Formula, ...more: Line[]): Explained {
  return { value: formula.result.value, lines: [formula, ...more] };
}

/** A value with no formula to show, just a sentence. */
export const fixed = (value: number, text: string): Explained => ({ value, lines: [{ text }] });

const en = (n: number, maximumFractionDigits = 0) => n.toLocaleString('en-US', { maximumFractionDigits });

export function formatNumber(value: number, format: Format): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  switch (format) {
    case 'usd': return `${sign}$${en(Math.round(abs))}`;
    case 'rate': return `${sign}$${abs.toFixed(abs < 1 ? 3 : 2)}`;
    case 'count': return `${sign}${en(Math.round(abs))}`;
    case 'number': return `${sign}${en(abs, 2)}`;
    case 'tenths': return `${sign}${abs.toFixed(1)}`;
    case 'percent': return `${sign}${en(abs * 100)}%`;
  }
}

export function formatQuantity({ value, format, label }: Quantity): string {
  const number = formatNumber(value, format);
  if (!label) return number;
  return /^[/-]/.test(label) ? `${number}${label}` : `${number} ${label}`;
}

const PRECEDENCE = { '+': 1, '−': 1, '×': 2, '÷': 2 } as const;

function formatExpr(expr: Expr): string {
  if ('value' in expr) return formatQuantity(expr);
  if ('ceil' in expr) return `⌈${formatExpr(expr.ceil)}⌉`;
  if ('group' in expr) return `(${formatExpr(expr.group)})`;
  const parent = PRECEDENCE[expr.op];
  const commutes = expr.op === '+' || expr.op === '×';
  return expr.terms
    .map((term, i) => {
      const text = formatExpr(term);
      if (!('op' in term)) return text;
      const child = PRECEDENCE[term.op];
      const needsParens = child < parent || (child === parent && i > 0 && !commutes);
      return needsParens ? `(${text})` : text;
    })
    .join(` ${expr.op} `);
}

export function formatLine(line: Line): string {
  if ('text' in line) return line.text;
  const note = line.note ? `, ${line.note}` : '';
  return `${formatQuantity(line.result)} = ${formatExpr(line.expr)}${note}`;
}

/** The tooltip text for a value: its lines, separated by blank lines. */
export const tooltip = (explained: Explained): string => explained.lines.map(formatLine).join('\n\n');
