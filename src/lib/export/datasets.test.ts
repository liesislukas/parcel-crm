import { describe, expect, it } from "vitest";
import type { Feature, Geometry } from "geojson";
import { toParcel, type RawParcelProperties } from "@/lib/parcel";
import type { ParcelMeta } from "@/components/map/MapWorkspace";
import {
  EXPORT_DATASETS,
  buildParcelRows,
  exportFilename,
  headerOf,
  slugifyProject,
} from "./datasets";

const SQUARE: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

function feature(properties: RawParcelProperties): Feature<Geometry, RawParcelProperties> {
  return { type: "Feature", geometry: SQUARE, properties };
}

const META: ParcelMeta = {
  county: "rock-island",
  countyName: "Rock Island County, IL",
  sourceLayerUrl:
    "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0",
  sourceOrg: "Rock Island County GIS",
  retrievedAt: "2026-08-11T22:48:11.490Z",
  bbox: [-90.58, 41.49, -90.54, 41.52],
  bboxLabel: "90.5800°W–90.5400°W, 41.4900°N–41.5200°N",
  areaLabel: "≈3.3 km × 3.3 km over the City of Rock Island, IL",
  parcelCount: 6026,
  countyParcelCount: 65955,
  incompletePins: ["0725200001"],
};

const PARCELS_HEADER =
  "pin,owner_name,taxbill_name,assessed_value_eav,market_value_emv,mailing_address,mailing_city_state_zip,acres,project_names_crm,county,county_slug,source_system,source_layer_url,source_retrieved_at,export_scope,export_generated_at";

const OWNERS_HEADER =
  "owner_id_crm,owner_name,mailing_address,mailing_city_state_zip,parcel_count,parcel_pins,total_acres,parcels_missing_acres,email_mock,phone_mock,contact_completeness_mock,contact_enriched_mock,contact_enriched_at_mock,source_system,export_scope,export_generated_at";

const CAMPAIGN_HEADER =
  "event_id_mock,campaign_id_mock,campaign_name_mock,channel_mock,message_id_mock,message_subject_mock,message_body_mock,event_state_mock,event_at_mock,owner_id_crm,owner_name,project_id_crm,project_name_crm,simulated,source_system,export_scope,export_generated_at";

function datasetById(id: "parcels" | "owners" | "campaign-activity") {
  const dataset = EXPORT_DATASETS.find((d) => d.id === id);
  if (!dataset) throw new Error(`no dataset registered for "${id}"`);
  return dataset;
}

describe("EXPORT_DATASETS headers", () => {
  it("parcels header matches the plan's byte-exact string", () => {
    expect(headerOf(datasetById("parcels")).join(",")).toBe(PARCELS_HEADER);
  });

  it("owners header matches the plan's byte-exact string", () => {
    expect(headerOf(datasetById("owners")).join(",")).toBe(OWNERS_HEADER);
  });

  it("campaign-activity header matches the plan's byte-exact string", () => {
    expect(headerOf(datasetById("campaign-activity")).join(",")).toBe(CAMPAIGN_HEADER);
  });
});

describe("EXPORT_DATASETS invariants", () => {
  it("has a unique id and non-empty columns per dataset, with lower_snake_case names", () => {
    const ids = EXPORT_DATASETS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const dataset of EXPORT_DATASETS) {
      expect(dataset.columns.length).toBeGreaterThan(0);
      for (const column of dataset.columns) {
        expect(column.name).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it("holds the mock-suffix labelling invariant in both directions", () => {
    for (const dataset of EXPORT_DATASETS) {
      for (const column of dataset.columns) {
        if (column.class === "mock") {
          expect(column.name.endsWith("_mock")).toBe(true);
        }
        if (column.name.endsWith("_mock")) {
          expect(column.class).toBe("mock");
        }
      }
    }
  });
});

describe("buildParcelRows", () => {
  it("emits empty mailing cells and a real 0 EAV for the AC5 row (PIN 0725200001)", () => {
    const parcel = toParcel(
      feature({
        PIN: "0725200001",
        owner1_name: "ROCK ISLAND ARSENAL",
        taxbill_name: "ROCK ISLAND ARSENAL",
        EAV: 0,
        EMV: 0,
        taxbill_addr: "",
        taxbill_csz: "",
        GIS_acres_num: 975.6855737299176,
      }),
    );

    const rows = buildParcelRows({
      parcels: [parcel],
      meta: META,
      projectNamesByPin: new Map(),
      scope: { kind: "all" },
      generatedAt: "2026-08-12T14:22:07.123Z",
    });

    const [row] = rows;
    const header = headerOf(datasetById("parcels"));
    const cell = (name: string) => row[header.indexOf(name)];

    expect(cell("pin")).toBe("0725200001");
    expect(cell("assessed_value_eav")).toBe("0");
    expect(cell("market_value_emv")).toBe("0");
    expect(cell("mailing_address")).toBe("");
    expect(cell("mailing_city_state_zip")).toBe("");
    expect(cell("acres")).toBe("975.6855737299176");
  });

  it("exports acreage unrounded for PIN 0736101016", () => {
    const parcel = toParcel(
      feature({
        PIN: "0736101016",
        owner1_name: "SOLIDUS GLOBAL LLC",
        taxbill_name: "SOLIDUS GLOBAL LLC",
        EAV: 526697,
        EMV: 1580249,
        taxbill_addr: "2929 5TH AVE",
        taxbill_csz: "ROCK ISLAND IL 612011908",
        GIS_acres_num: 3.4339668087051356,
      }),
    );

    const rows = buildParcelRows({
      parcels: [parcel],
      meta: META,
      projectNamesByPin: new Map(),
      scope: { kind: "all" },
      generatedAt: "2026-08-12T14:22:07.123Z",
    });

    const header = headerOf(datasetById("parcels"));
    expect(rows[0][header.indexOf("acres")]).toBe("3.4339668087051356");
  });

  it("exports an empty acres cell when GIS_acres_num is 0 (impossible for a polygon)", () => {
    const parcel = toParcel(
      feature({
        PIN: "TESTPIN000",
        owner1_name: "TEST OWNER",
        taxbill_name: "TEST OWNER",
        EAV: 100,
        EMV: 200,
        taxbill_addr: "1 MAIN ST",
        taxbill_csz: "ROCK ISLAND IL 61201",
        GIS_acres_num: 0,
      }),
    );

    const rows = buildParcelRows({
      parcels: [parcel],
      meta: META,
      projectNamesByPin: new Map(),
      scope: { kind: "all" },
      generatedAt: "2026-08-12T14:22:07.123Z",
    });

    const header = headerOf(datasetById("parcels"));
    expect(rows[0][header.indexOf("acres")]).toBe("");
  });

  it("joins linked project names with ; and leaves the cell empty for a parcel in no project", () => {
    const parcel = toParcel(
      feature({
        PIN: "0736312033",
        owner1_name: "RI HOUSING AUTH",
        taxbill_name: "RI HOUSING AUTH",
        EAV: 0,
        EMV: 0,
        taxbill_addr: "227 21ST ST",
        taxbill_csz: "ROCK ISLAND IL 612018819",
        GIS_acres_num: 5.511269393202206,
      }),
    );

    const rows = buildParcelRows({
      parcels: [parcel],
      meta: META,
      projectNamesByPin: new Map([["0736312033", ["Riverfront North", "Downtown Block"]]]),
      scope: { kind: "all" },
      generatedAt: "2026-08-12T14:22:07.123Z",
    });

    const header = headerOf(datasetById("parcels"));
    expect(rows[0][header.indexOf("project_names_crm")]).toBe("Riverfront North;Downtown Block");
  });

  it("writes the scope cell and the source metadata columns verbatim from meta", () => {
    const parcel = toParcel(
      feature({
        PIN: "0736312033",
        owner1_name: "RI HOUSING AUTH",
        taxbill_name: "RI HOUSING AUTH",
        EAV: 0,
        EMV: 0,
        taxbill_addr: "227 21ST ST",
        taxbill_csz: "ROCK ISLAND IL 612018819",
        GIS_acres_num: 5.511269393202206,
      }),
    );

    const scope = {
      kind: "project" as const,
      id: "p1",
      name: "Riverfront North",
      slug: "riverfront-north",
    };
    const rows = buildParcelRows({
      parcels: [parcel],
      meta: META,
      projectNamesByPin: new Map(),
      scope,
      generatedAt: "2026-08-12T14:22:07.123Z",
    });

    const header = headerOf(datasetById("parcels"));
    const cell = (name: string) => rows[0][header.indexOf(name)];
    expect(cell("county")).toBe("Rock Island County, IL");
    expect(cell("county_slug")).toBe("rock-island");
    expect(cell("source_system")).toBe("rock-island-county-gis");
    expect(cell("source_layer_url")).toBe(META.sourceLayerUrl);
    expect(cell("source_retrieved_at")).toBe("2026-08-11T22:48:11.490Z");
    expect(cell("export_scope")).toBe("project:riverfront-north");
    expect(cell("export_generated_at")).toBe("2026-08-12T14:22:07.123Z");
  });
});

describe("exportFilename", () => {
  it("builds an unscoped filename from the date portion of generatedAt", () => {
    expect(exportFilename("parcels", { kind: "all" }, "2026-08-12T14:22:07.123Z")).toBe(
      "parcel-crm_parcels_2026-08-12.csv",
    );
  });

  it("builds a project-scoped filename with the project slug", () => {
    expect(
      exportFilename(
        "campaign-activity",
        { kind: "project", id: "p1", name: "Riverfront North", slug: "riverfront-north" },
        "2026-08-12T14:22:07.123Z",
      ),
    ).toBe("parcel-crm_campaign-activity_project-riverfront-north_2026-08-12.csv");
  });
});

describe("slugifyProject", () => {
  it("lowercases, collapses non-alphanumerics, and trims", () => {
    expect(slugifyProject("  Riverfront North (Phase 2)  ")).toBe("riverfront-north-phase-2");
  });

  it("falls back to 'unnamed' when nothing alphanumeric survives", () => {
    expect(slugifyProject("!!!")).toBe("unnamed");
  });
});
