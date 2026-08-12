# Demo — Parcel Acquisition CRM

**Live runtime:** https://parcel-crm-liesislukas-projects.vercel.app/ — public, no credentials,
no local setup.

![Parcel CRM walkthrough](./parcel-crm-demo.gif)

Recorded against the deployed runtime, not a local build. Every frame is the hosted URL above.

## What the walkthrough shows

1. **The CRM shell** — the six acquisition-workflow sections (Map, Projects, Owners, Campaigns,
   Tasks, Export) and, greyed out below them, the future-scope sections that sit beyond this
   milestone.
2. **Real Rock Island County parcels on an interactive map.** The banner states the scope
   honestly: 6,026 of 65,955 county parcels loaded, the bounding area, the retrieval date, a link
   to the source layer, and the 59,929 parcels deliberately not loaded.
3. **Clicking a single parcel** — PIN `0736312033`, `RI HOUSING AUTH`, assessed value, mailing
   address and acreage, with the parcel highlighted on the map.
4. **Drawing an area** — a contiguous rectangle over a block of downtown Rock Island selects
   **2,060 parcels**, every one highlighted, with the count and the highlight driven by the same
   selection so they cannot disagree.
5. **Missing source data handled honestly** — PIN `0725200001` (`ROCK ISLAND ARSENAL`, 975.69 ac)
   shows its mailing address as *Not available* rather than blank or invented, while its `$0`
   assessed value is shown as a real value with the reason, because the parcel is tax-exempt.
   Absent and zero are not the same thing and the UI does not conflate them.
6. **The disabled future-scope sections** — visible and labelled, not hidden.

## Data provenance

Parcels come from Rock Island County GIS's own public ArcGIS FeatureServer
(`services9.arcgis.com/6FnscPPlUa9DXXOk/.../Parcels/FeatureServer/0`, licensed "For use by the
general public", no API key). The committed snapshot is a verbatim copy of the county's records —
no values are defaulted, substituted, or cleaned. `scripts/fetch-parcels.mjs` regenerates it.

## What is not built yet

Project grouping and combined acreage, owner CRM records, mocked email/direct-mail/SMS campaigns,
task assignment, filtering and export are not in this milestone. The disabled sections and the
placeholder routes mark where they land.
