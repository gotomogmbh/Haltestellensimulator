import { describe, expect, it } from "vitest";

import {
  Coordinate,
  ElementSize,
  HardwareIntegrationClass,
  ImportStatus,
  ImportType,
  OperatorArea,
  PoiRelevance,
  ScoreBreakdown,
  SiteHardwareInventoryInput,
  YesNoUnknown,
  normalizeYesNoUnknown,
} from "./domain";

describe("Enum schemas mirror Prisma", () => {
  it("YesNoUnknown accepts exactly YES/NO/UNKNOWN", () => {
    expect(YesNoUnknown.parse("YES")).toBe("YES");
    expect(YesNoUnknown.parse("NO")).toBe("NO");
    expect(YesNoUnknown.parse("UNKNOWN")).toBe("UNKNOWN");
    expect(() => YesNoUnknown.parse("yes")).toThrow();
    expect(() => YesNoUnknown.parse("maybe")).toThrow();
  });

  it.each([
    [ElementSize, "L"],
    [HardwareIntegrationClass, "A_REUSE_DFI_STANDALONE"],
    [ImportStatus, "NEEDS_REVIEW"],
    [ImportType, "HARDWARE_INVENTORY"],
    [OperatorArea, "VBZ"],
    [PoiRelevance, "CRITICAL"],
  ])("%# enum accepts a valid value", (schema, value) => {
    expect(schema.parse(value)).toBe(value);
  });
});

describe("normalizeYesNoUnknown", () => {
  it.each([
    ["ja", "YES"],
    ["yes", "YES"],
    ["1", "YES"],
    ["X", "YES"],
    ["true", "YES"],
    ["nein", "NO"],
    ["0", "NO"],
    ["false", "NO"],
    ["", "UNKNOWN"],
    ["unbekannt", "UNKNOWN"],
    ["?", "UNKNOWN"],
    ["k.a.", "UNKNOWN"],
    ["-", "UNKNOWN"],
  ])("maps %s -> %s", (raw, expected) => {
    expect(normalizeYesNoUnknown(raw)).toBe(expected);
  });

  it("treats null/undefined as UNKNOWN", () => {
    expect(normalizeYesNoUnknown(null)).toBe("UNKNOWN");
    expect(normalizeYesNoUnknown(undefined)).toBe("UNKNOWN");
  });

  it("accepts boolean/number inputs", () => {
    expect(normalizeYesNoUnknown(true)).toBe("YES");
    expect(normalizeYesNoUnknown(false)).toBe("NO");
    expect(normalizeYesNoUnknown(1)).toBe("YES");
    expect(normalizeYesNoUnknown(0)).toBe("NO");
  });

  it("returns null for unmappable values (-> ImportError downstream)", () => {
    expect(normalizeYesNoUnknown("vielleicht")).toBeNull();
    expect(normalizeYesNoUnknown("manchmal")).toBeNull();
    expect(normalizeYesNoUnknown("2")).toBeNull();
  });
});

describe("Coordinate", () => {
  it("accepts valid WGS84 coordinates", () => {
    expect(Coordinate.parse({ latitude: 47.37, longitude: 8.54 })).toEqual({
      latitude: 47.37,
      longitude: 8.54,
    });
  });

  it("rejects out-of-range values", () => {
    expect(() => Coordinate.parse({ latitude: 91, longitude: 0 })).toThrow();
    expect(() => Coordinate.parse({ latitude: 0, longitude: -181 })).toThrow();
  });
});

describe("SiteHardwareInventoryInput", () => {
  it("fills missing flags with UNKNOWN", () => {
    const result = SiteHardwareInventoryInput.parse({});
    expect(result.dfiStandfuss).toBe("UNKNOWN");
    expect(result.dfiStrommast).toBe("UNKNOWN");
    expect(result.ticketautomat).toBe("UNKNOWN");
    expect(result.strom).toBe("UNKNOWN");
    expect(result.wartehaus).toBe("UNKNOWN");
  });

  it("accepts a full row with notes and recordedAt", () => {
    const result = SiteHardwareInventoryInput.parse({
      dfiStandfuss: "YES",
      dfiStrommast: "NO",
      ticketautomat: "UNKNOWN",
      strom: "YES",
      wartehaus: "YES",
      notes: "neue Halterung 2026",
      recordedAt: "2026-05-01T12:00:00Z",
    });
    expect(result.dfiStandfuss).toBe("YES");
    expect(result.notes).toBe("neue Halterung 2026");
    expect(result.recordedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid enum values", () => {
    expect(() =>
      SiteHardwareInventoryInput.parse({ dfiStandfuss: "yes" }),
    ).toThrow();
  });
});

describe("ScoreBreakdown", () => {
  it("validates a complete breakdown", () => {
    const breakdown = ScoreBreakdown.parse({
      frequency: 0.8,
      poiRelevance: 0.4,
      infrastructure: 0.7,
      rawTotal: 1.9,
      weightedTotal: 0.66,
    });
    expect(breakdown.weightedTotal).toBeCloseTo(0.66);
  });

  it("rejects partial breakdowns", () => {
    expect(() => ScoreBreakdown.parse({ frequency: 0.8 })).toThrow();
  });
});
