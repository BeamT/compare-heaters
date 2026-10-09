// The experience card: what each option does for people beyond cost. Editing a
// row means editing one line. Fairness rule: a competitor gets ✓ only if what
// it takes is already in its cost column.
import type { OptionKey } from './assumptions.ts';

export interface Feature {
  /** The benefit to people, not the feature. */
  label: string;
  has: Record<OptionKey, boolean>;
  /** How Focal does it, shown under its check. */
  focal: string;
  source: string;
}

const row = (label: string, [focal, propane, gas, electric]: [0 | 1, 0 | 1, 0 | 1, 0 | 1], how: string, source = ''): Feature => ({
  label,
  has: { focal: !!focal, propane: !!propane, gas: !!gas, electric: !!electric },
  focal: how,
  source,
});

// ✓ (1) or — (0) for Focal, propane, gas, electric.
export const FEATURES: readonly Feature[] = [
  row('Every guest is comfortable', [1, 0, 0, 0], 'Guests set their own heat', 'Other heaters warm a zone, at a level staff set.'),
  row('No heating empty seats', [1, 0, 0, 0], 'Off when guests leave and at close', 'Gas and electric controls are a wall panel staff switch each night; only Focal turns off by itself.'),
  row('No fuel to buy, store or swap', [1, 0, 1, 1], 'Plugs into a standard 120V outlet', "Gas's line is in its install cost."),
  row('Nothing burning near guests', [1, 0, 0, 1], 'No flame, no exhaust to breathe'),
  row('Nothing for guests or staff to trip over', [1, 0, 1, 1], 'Mounted overhead', 'Propane towers stand on the patio floor.'),
  row('Heat follows your tables when you rearrange', [1, 1, 0, 0], 'Slides anywhere on the rail', 'Gas and electric are fixed where installed; towers can be wheeled anywhere; Focal moves within its rail.'),
  row('Nothing to maintain', [1, 0, 0, 0], 'We monitor and fix issues', 'Focal subscription'),
];
