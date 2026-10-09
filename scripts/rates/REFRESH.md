# Yearly rate refresh

The page pre-fills each visitor's evening electricity and gas rates from a
snapshot in `public/rates`: one small file per 3-digit ZIP prefix, plus
`us.json` for ZIPs the snapshot doesn't cover. Refresh it once a year, in
September or later, once the EIA has published the last full year.

## Sources

- **Electricity by ZIP:** NREL, "U.S. Electric Utility Companies and Rates:
  Look-up by Zip Code" (OEDI submission 8563), CC BY 4.0. Each utility's
  average commercial rate, and the ZIPs it serves. Only utilities that sell
  the power ("Bundled") are used.
- **Electricity by state** (fallback): EIA API, `electricity/retail-sales`,
  commercial sector, annual.
- **Natural gas by state:** EIA API, `natural-gas/pri/sum`, price delivered to
  commercial consumers, annual, $/Mcf ÷ 10.36 → $/therm.
- **Fixes:** `scripts/rates/overrides.ts` names utilities the way visitors know
  them and fixes wrong ZIP mappings.

The page shows a utility's average × 1.25 as the evening rate
(`EVENING_FACTOR` in `src/assumptions.ts`), and the visitor can edit it.

## Checklist

1. Check for a newer NREL edition: search data.openei.org for "Look-up by Zip
   Code". If there's one, update `ZIP_TABLE_YEAR` and the file URLs in
   `scripts/rates/refresh.ts`, and check that its columns still match the
   ones `zipRows()` reads.
2. Get a free EIA API key (eia.gov/opendata) if you don't have one. Without
   it the script uses `DEMO_KEY`, which works but is rate-limited.
3. Run `EIA_API_KEY=… pnpm rates:refresh`. It prints the prefix file count, the
   year of each source and the US averages. Check that the years moved forward
   and the US averages are plausible (about $0.10–0.20/kWh and $0.80–1.50/therm).
   The script uses the latest year with a US average; the EIA revises gas
   prices until about 10 months after year-end, so a September refresh may use
   preliminary values. That's fine for a pre-filled estimate.
4. Check that the overrides still apply: for each ID in `overrides.ts`, search
   the new CSVs to confirm the utility still has that EIA ID. Also confirm
   that San Francisco ZIPs (941xx) still list PG&E first.
5. Run `pnpm test`. `src/rates.snapshot.test.ts` checks San Francisco, Denver,
   Austin and New York against sensible ranges, and that every file stays
   small. If a range fails, find out why before widening it.
6. Look over `git diff --stat public/rates`. Most files should change a
   little; a large number of added or deleted files means the ZIP table
   changed shape.
7. Commit with the source years in the message (e.g. "Refresh rates: utilities
   2025, EIA 2026").
