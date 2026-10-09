# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Static TypeScript bundle, no framework or charting library.
- M1: GitHub Pages on a focalheat.co subdomain (name TBD), a standalone full page.
- Later: the same bundle moves onto a focalheat.co page (Webflow), as an embed or at a proxied path, so it's built to run either way.

## Users

- **Primary:** independent restaurant owner or GM deciding how to heat their patio. Arrives from focalheat.co or a sales link, usually before a demo, and uses it alone. Thinks in seats, covers and turns, not kW.
- **Secondary:** a Focal salesperson walking a prospect through it live, e.g. at a trade event.

## Product Purpose

- Free public tool ("Compare patio heaters") that puts Focal side by side with the heater an operator uses or is considering: propane towers, natural gas, conventional electric.
- Shows 5-year, upfront and yearly cost (total and per seat), an optional operator-owned estimate of revenue from heating a cold patio, and a small non-financial experience comparison.
- **Success:** operators see where they stand before talking to sales, and strong results lead to "Get a proposal for my patio".

## Positioning

- Focal's cost edge depends on local rates and patio size; the experience sets it apart too: per-seat heat guests set themselves, turns off by itself when guests leave, nothing burning, monitored. The tool shows both.
- Focal's energy scales with occupancy (heats a seat only while it's occupied); other heaters cover 4–6 seats and run whenever anyone in their area is seated.
- Credibility through transparency: every calculated number shows its formula with real values filled in.

## Operating Context

- Calculates entirely in the visitor's browser; no server, no live rate APIs. Rates come from a build-time `rates.json` snapshot (NREL/EIA by ZIP).
- Results are ungated. One email field, two actions: "Email me my results" and "Get a proposal for my patio →".
- Inputs live in the query string so the URL and results email reproduce the same numbers. No copy-link button by design.
- Starts as a standalone page on a focalheat.co subdomain, then moves into a focalheat.co (Webflow) page, so it has to look native on its own and fit in that page's surroundings.

## Capabilities and Constraints

- Restaurants only. Results are estimates, not quotes. Competitors are categories, never named brands.
- Formula tooltips must work by tap on mobile.
- Terminology: Duo (the heater), seats/covers, heating months, heating hours.
- Warranty: 3 years (matches focalheat.co).

## Brand Commitments

- Must feel native on focalheat.co, where it will be embedded. Reference page: <https://www.focalheat.co/our-heaters>.
- The site's identity is the visual authority: Webflow color variables `--dusk`, `--dark-teal`, `--orange`, `--shine`, `--yellow`, `--fog`, `--off-white`, `--light-gray`, `--black`, and the typefaces Elza, Elza Condensed and Azeret Mono.
- Voice: confident, plain, aimed at operators. Tagline "Heat people, not spaces." Short fragment lists like "No flames. No permits. No worries." The site's primary CTA is "Request a demo".
- The calculator shows only computed numbers. It doesn't repeat marketing stats such as percentage savings.

## Do Not Fabricate

Testimonials, customer names, review-lift or health stats, or revenue from comfort versus other heaters.

## Product Principles

1. **Honest over persuasive.** Show where Focal is merely level; every number is traceable to its formula and an editable assumption.
2. **The operator owns their numbers.** Their patio facts drive everything; revenue upside is their estimate, opt-in.
3. **Fair to competitors.** A competitor gets ✓ only when what it takes is already in its cost column.
4. **No gate before value.** Results first; email and proposal are optional next steps.
5. **Speak operator, not engineer.** Per-seat, covers, nights; physics stays in tooltips.
