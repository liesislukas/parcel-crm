# Demo — Parcel Acquisition CRM

**Live runtime:** https://parcel-crm-liesislukas-projects.vercel.app/ — public, no credentials,
no local setup.

## Demo video

[`parcel-crm-demo-video.mp4`](./parcel-crm-demo-video.mp4) — a ~2:35, captioned walkthrough
recorded headless with Playwright's `chromium` against the deployed URL above, driving the
assignment README's own Demo Transcript (lines 32–42) end to end: the full-county map with the
power overlay, the SEEDED demo state, drawing an area and keeping the largest block into a new
project, `/projects` filters against the seeded rows, the FIRST FINANCIAL GROUP LLC mocked
buy/enrich flow, the seeded campaign's completed lifecycle and one message's full event
timeline, setting interest/asking price/stage and assigning a task that then appears under
`/tasks`, downloading the parcels CSV, and the `/sources` honesty gaps. On-screen captions (no
audio) state what's being demonstrated, mostly in the transcript's own wording, injected as a
fixed bar via `page.evaluate` rather than burned in during editing. Recorded against commit
`d0058cd`.

![Parcel CRM walkthrough](./parcel-crm-demo.gif)

Recorded against the deployed runtime, not a local build. Every frame is the hosted URL above,
serving commit `61ca2b2`.

> **Re-record needed (2026-08-12).** ISSUE-013 raised coverage from the 6,026-parcel working
> subset to all 65,955 county records, so the walkthrough above still shows the old subset
> framing and the old banner text. The numbered description below has been corrected to what
> the deployed runtime does now; the GIF itself has not yet been re-recorded.

## What the walkthrough shows

1. **The map with the power overlay on** — 65,955 real Rock Island County parcel records, 65,953
   of them mapped, plus 107 OSM substations and 315 transmission-line ways in violet, with the
   scope and sources stated in the banner (65,955 of 65,955 loaded, the 2 records with no outline
   named, retrieval date, source links).
2. **Drawing an area** — a drag over downtown Rock Island selects 1,099 parcels. The selection
   panel reports 240.29 ac across 142 separate blocks and 931 distinct owners, states the
   adjacency rule, and discloses the condo/PUD duplicate-outline dedup rather than double-counting.
3. **Keep largest block → Create project** — the selection narrows to the largest contiguous
   block (43 parcels, 39.64 ac, 31 owners) and becomes "Downtown Rock Island Site". The nearest
   substation for the selection reads 0.94 km (0.58 mi).
4. **Projects with filters** — the saved project listed with county, combined acreage, power
   distance from real OSM data, outreach status, and acquisition stage; filter controls for all
   five dimensions, with unknowns surfaced rather than hidden.
5. **Owner CRM record** — FIRST FINANCIAL GROUP LLC: county-sourced ownership and mailing
   addresses attributed to the county layer, simulated contact fields clearly separated, and the
   **mocked buy/enrich flow**: the dialog states no payment is taken and no vendor is called,
   and the enriched email/phone arrive labelled MOCKED (`.invalid` domain, `555-01xx` range).
6. **Campaigns** — email, SMS and direct-mail campaigns created over the top-8 owner audience,
   every screen bannered SIMULATED. Rock Island Arsenal is skipped for direct mail because the
   county publishes no mailing address for it — stated, not papered over. Running the simulation
   shows the full lifecycle: sent 8, delivered 7, clicked 4, replied 2, bounced 1, opens,
   portal log-ins, an opt-out.
7. **Export** — parcels, owners, and campaign-activity CSVs with the provenance legend: no-suffix
   columns are verbatim county data, `_mock` is simulated, `_crm` is user-created, and a real $0
   assessed value exports as 0 because it is a fact.
8. **Data sources** — the discovery inventory behind everything: every located Rock Island
   source with access method, measured latency and licence, the Lithuania-egress probing
   limitation stated up front, and the signals with no public source listed instead of invented.

## Data provenance

Parcels come from Rock Island County GIS's own public ArcGIS FeatureServer
(`services9.arcgis.com/6FnscPPlUa9DXXOk/.../Parcels/FeatureServer/0`, licensed "For use by the
general public", no API key). Power infrastructure comes from OpenStreetMap via Overpass (ODbL
v1.0). Committed snapshots are verbatim copies — no values defaulted, substituted, or cleaned.
`scripts/fetch-parcels.mjs` and `scripts/fetch-power.mjs` regenerate them. All contact data,
campaign events, team members, and acquisition figures are simulated and labelled as such;
mocked emails use the reserved `.invalid` domain and phones the fictional `555-01xx` block.
