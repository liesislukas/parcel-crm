import { beforeEach, describe, expect, it } from "vitest";
import {
  ACQUISITION_KEY,
  readAcquisition,
  resetAcquisition,
  writeAcquisition,
  type AcquisitionStore,
} from "@/lib/store";

/** Minimal in-memory localStorage stub, installed fresh before every test. */
function installLocalStorageStub() {
  const data = new Map<string, string>();
  const stub: Storage = {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: stub,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  installLocalStorageStub();
});

describe("readAcquisition", () => {
  it("returns the seed and throws nothing when there is no window", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    expect(() => readAcquisition("2026-08-12")).not.toThrow();
    const store = readAcquisition("2026-08-12");
    expect(store.records).toBeTruthy();
    expect(store.tasks.length).toBe(18);
  });

  it("seeds a fresh stub with 15 records, 18 tasks and 25 events, and persists it", () => {
    const store = readAcquisition("2026-08-12");
    expect(Object.keys(store.records)).toHaveLength(15);
    expect(store.tasks).toHaveLength(18);
    expect(store.events).toHaveLength(25);
    expect(window.localStorage.getItem(ACQUISITION_KEY)).not.toBeNull();
  });

  it("returns the seeded store and leaves a corrupt value in place", () => {
    window.localStorage.setItem(ACQUISITION_KEY, "{not json");
    const store = readAcquisition("2026-08-12");
    expect(Object.keys(store.records)).toHaveLength(15);
    expect(window.localStorage.getItem(ACQUISITION_KEY)).toBe("{not json");
  });

  it("falls back to the seed for an unsupported version", () => {
    window.localStorage.setItem(ACQUISITION_KEY, JSON.stringify({ version: 2 }));
    const store = readAcquisition("2026-08-12");
    expect(Object.keys(store.records)).toHaveLength(15);
  });

  it("round-trips a legitimately empty tasks array without re-seeding", () => {
    const empty: AcquisitionStore = { version: 1, records: {}, tasks: [], events: [] };
    writeAcquisition(empty);
    const read = readAcquisition("2026-08-12");
    expect(read.tasks).toEqual([]);
  });
});

describe("resetAcquisition", () => {
  it("restores 15 records, 18 tasks and 25 events after an empty write", () => {
    writeAcquisition({ version: 1, records: {}, tasks: [], events: [] });
    const reset = resetAcquisition("2026-08-12");
    expect(Object.keys(reset.records)).toHaveLength(15);
    expect(reset.tasks).toHaveLength(18);
    expect(reset.events).toHaveLength(25);
  });
});
