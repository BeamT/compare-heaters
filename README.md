# Compare patio heaters

A free calculator that puts Focal side by side with propane towers, natural gas
and conventional electric patio heaters: cost over the first 5 years, upfront and
yearly (total and per seat), an optional revenue estimate, and a small
experience comparison. Everything runs in the visitor's browser.

The product spec lives in Focal's internal docs.

## Layout

- `src/assumptions.ts`: every default value, its unit, a visitor-facing description and a short source.
- `src/calculate.ts`: the calculation model. Every result carries the formula behind it.
- `src/formula.ts`: formula values and their tooltip text. Each number is evaluated from its formula, so a tooltip can't disagree with its number.

## Develop

```sh
pnpm install   # also points git at .githooks
pnpm typecheck
pnpm test
```

## This repo is public

A pre-commit and commit-message hook, and CI, fail on a denylist of internal
words (customer, team, brand and vendor names). The list is stored only as
fingerprints in `scripts/denylist.ts`; see that file to add one.
