import { describe, expect, it } from "vitest";
import { CSV_BOM, csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("returns the empty string for null, undefined, and empty string", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("")).toBe("");
  });

  it("stringifies 0 as the literal character '0', distinct from a missing cell", () => {
    expect(csvCell(0)).toBe("0");
    expect(csvCell(0)).not.toBe(csvCell(null));
  });

  it("stringifies a double verbatim, with no rounding", () => {
    expect(csvCell(3.4339668087051356)).toBe("3.4339668087051356");
  });

  it("passes a plain string through unchanged", () => {
    expect(csvCell("ROCK ISLAND ARSENAL")).toBe("ROCK ISLAND ARSENAL");
  });
});

describe("toCsv", () => {
  it("emits a plain row unquoted and CRLF-terminated", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2\r\n");
  });

  it("wraps a comma-bearing field in quotes and preserves its double space", () => {
    const csv = toCsv(["taxbill_name"], [["GARCIA,  ANTONIO & PIZANO, VALENTINA"]]);
    expect(csv).toBe('taxbill_name\r\n"GARCIA,  ANTONIO & PIZANO, VALENTINA"\r\n');
  });

  it("wraps a field containing a quote and doubles the quote", () => {
    const csv = toCsv(["x"], [['He said "hi"']]);
    expect(csv).toBe('x\r\n"He said ""hi"""\r\n');
  });

  it("wraps a field with a leading or trailing space", () => {
    expect(toCsv(["x"], [[" leading"]])).toBe('x\r\n" leading"\r\n');
    expect(toCsv(["x"], [["trailing "]])).toBe('x\r\n"trailing "\r\n');
  });

  it("emits an empty cell as zero characters between two commas", () => {
    const csv = toCsv(["h1", "h2", "h3"], [["a", csvCell(null), "b"]]);
    expect(csv.endsWith("a,,b\r\n")).toBe(true);
  });

  it("emits csvCell(0) as the character '0', never as an empty cell", () => {
    const csv = toCsv(["h1", "h2", "h3"], [["a", csvCell(0), "b"]]);
    expect(csv.endsWith("a,0,b\r\n")).toBe(true);
  });

  it("returns just the header row plus one CRLF when there are zero data rows", () => {
    const header = ["pin", "owner_name"];
    expect(toCsv(header, [])).toBe(header.join(",") + "\r\n");
  });

  it("passes non-ASCII text through unaltered and unquoted", () => {
    const csv = toCsv(["taxbill_name"], [["PEÑA-REYES GUADALUPE"]]);
    expect(csv).toBe("taxbill_name\r\nPEÑA-REYES GUADALUPE\r\n");
  });
});

describe("CSV_BOM", () => {
  it("is the single UTF-8 byte-order-mark character", () => {
    expect(CSV_BOM).toBe("﻿");
    expect(CSV_BOM.length).toBe(1);
  });
});
