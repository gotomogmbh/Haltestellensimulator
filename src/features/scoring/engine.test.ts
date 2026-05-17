import { describe, expect, it } from "vitest";

import {
  RULE_VERSION,
  baseElementSize,
  classifyHardware,
  computeConfidence,
  computeElementCount,
  computeElementSize,
  computeRecommendation,
  computeScoreBreakdown,
  frequencyScore,
  poiScore,
  poiSizeShift,
  shiftSize,
  type HardwareInput,
  type ScoringInputs,
} from "./engine";

const fullKnown: HardwareInput = {
  dfiStandfuss: "YES",
  dfiStrommast: "NO",
  ticketautomat: "YES",
  strom: "YES",
  wartehaus: "YES",
  hasInventory: true,
};

const allUnknown: HardwareInput = {
  dfiStandfuss: "UNKNOWN",
  dfiStrommast: "UNKNOWN",
  ticketautomat: "UNKNOWN",
  strom: "UNKNOWN",
  wartehaus: "UNKNOWN",
  hasInventory: true,
};

const noHardware: HardwareInput = {
  dfiStandfuss: "NO",
  dfiStrommast: "NO",
  ticketautomat: "NO",
  strom: "NO",
  wartehaus: "NO",
  hasInventory: true,
};

const makeInputs = (over: Partial<ScoringInputs> = {}): ScoringInputs => ({
  hardware: over.hardware ?? fullKnown,
  frequency: over.frequency ?? {
    weekdayDeparturesSum: 100,
    servedRoutesCount: 2,
  },
  poi: over.poi ?? { relevanceSum: 0, eventsActive: false },
  site: over.site ?? { needsReview: false },
});

describe("classifyHardware", () => {
  it("uses first-match priority A → G", () => {
    expect(classifyHardware(fullKnown)).toBe("A_REUSE_DFI_STANDALONE");
    expect(
      classifyHardware({ ...fullKnown, dfiStandfuss: "NO", dfiStrommast: "YES" }),
    ).toBe("B_REUSE_DFI_POLE");
    expect(
      classifyHardware({
        ...fullKnown,
        dfiStandfuss: "NO",
        dfiStrommast: "NO",
        ticketautomat: "YES",
      }),
    ).toBe("C_REUSE_TICKET_MACHINE");
    expect(
      classifyHardware({
        ...fullKnown,
        dfiStandfuss: "NO",
        dfiStrommast: "NO",
        ticketautomat: "NO",
        wartehaus: "YES",
      }),
    ).toBe("D_REUSE_SHELTER");
    expect(
      classifyHardware({
        dfiStandfuss: "NO",
        dfiStrommast: "NO",
        ticketautomat: "NO",
        strom: "YES",
        wartehaus: "NO",
        hasInventory: true,
      }),
    ).toBe("E_POWER_AVAILABLE_NEW_MOUNT");
    expect(classifyHardware(noHardware)).toBe("F_NO_HARDWARE");
    expect(classifyHardware(allUnknown)).toBe("G_UNKNOWN");
  });

  it("returns G_UNKNOWN when no inventory exists", () => {
    expect(
      classifyHardware({ ...allUnknown, hasInventory: false }),
    ).toBe("G_UNKNOWN");
  });

  it("returns G_UNKNOWN when one flag is YES but others UNKNOWN — wait, no: any YES wins", () => {
    // First YES always takes precedence over UNKNOWN.
    expect(
      classifyHardware({ ...allUnknown, dfiStrommast: "YES" }),
    ).toBe("B_REUSE_DFI_POLE");
  });
});

describe("baseElementSize", () => {
  it.each([
    [0, "S"],
    [49, "S"],
    [50, "M"],
    [199, "M"],
    [200, "L"],
    [499, "L"],
    [500, "XL"],
    [999, "XL"],
    [1000, "XXL"],
    [5000, "XXL"],
  ] as const)("%i abfahrten → %s", (d, expected) => {
    expect(baseElementSize(d)).toBe(expected);
  });
});

describe("poiSizeShift", () => {
  it.each([
    [0, false, 0],
    [2.9, false, 0],
    [3.0, false, 1],
    [5.9, false, 1],
    [6.0, false, 2],
    [10, false, 2],
    [0, true, 1],
    [3, true, 2],
    [6, true, 3],
  ] as const)("sum=%s, events=%s → shift=%i", (s, e, expected) => {
    expect(poiSizeShift({ relevanceSum: s, eventsActive: e })).toBe(expected);
  });
});

describe("shiftSize", () => {
  it("clamps at S and XXL", () => {
    expect(shiftSize("S", -5)).toBe("S");
    expect(shiftSize("XXL", 5)).toBe("XXL");
    expect(shiftSize("M", -1)).toBe("S");
    expect(shiftSize("L", 1)).toBe("XL");
  });
});

describe("computeElementSize", () => {
  it("Wartehaus = NO bremst XL/XXL ab", () => {
    const inputs = {
      weekdayDeparturesSum: 1000, // XXL base
      servedRoutesCount: 5,
    };
    const sized = computeElementSize(
      inputs,
      { ...fullKnown, wartehaus: "NO" },
      { relevanceSum: 0, eventsActive: false },
    );
    expect(sized).toBe("XL"); // XXL -1
  });

  it("POI-Boost + Event addieren", () => {
    const sized = computeElementSize(
      { weekdayDeparturesSum: 100, servedRoutesCount: 2 }, // base M
      fullKnown,
      { relevanceSum: 6, eventsActive: true }, // +2 +1 = +3
    );
    expect(sized).toBe("XXL"); // M +3 = XXL
  });
});

describe("computeElementCount", () => {
  it.each([
    [{ size: "S", routes: 1, hotspot: false, count: 1 }],
    [{ size: "M", routes: 3, hotspot: false, count: 1 }],
    [{ size: "L", routes: 2, hotspot: false, count: 1 }],
    [{ size: "L", routes: 3, hotspot: false, count: 2 }],
    [{ size: "XL", routes: 2, hotspot: false, count: 2 }],
    [{ size: "XXL", routes: 4, hotspot: false, count: 2 }],
    [{ size: "XXL", routes: 5, hotspot: false, count: 3 }],
    [{ size: "L", routes: 2, hotspot: true, count: 2 }], // +1 hotspot
  ] as const)("$size / routes $routes / hotspot $hotspot → $count", ({ size, routes, hotspot, count }) => {
    expect(
      computeElementCount(
        size as never,
        { weekdayDeparturesSum: 0, servedRoutesCount: routes },
        { relevanceSum: hotspot ? 6 : 0, eventsActive: false },
      ),
    ).toBe(count);
  });

  it("Hotspot deckelt bei 4", () => {
    expect(
      computeElementCount(
        "XXL",
        { weekdayDeparturesSum: 0, servedRoutesCount: 10 },
        { relevanceSum: 10, eventsActive: true },
      ),
    ).toBe(4);
  });
});

describe("scores", () => {
  it("frequencyScore log scale", () => {
    expect(frequencyScore(0)).toBe(0);
    expect(frequencyScore(1000)).toBe(1);
    expect(frequencyScore(10000)).toBe(1); // clamped
  });

  it("poiScore mit Event-Bonus geklemmt", () => {
    expect(poiScore({ relevanceSum: 0, eventsActive: false })).toBe(0);
    expect(poiScore({ relevanceSum: 6, eventsActive: false })).toBe(1);
    expect(poiScore({ relevanceSum: 6, eventsActive: true })).toBe(1); // clamp
  });

  it("computeScoreBreakdown gewichtet 50/30/20", () => {
    const sb = computeScoreBreakdown(
      makeInputs({
        frequency: { weekdayDeparturesSum: 1000, servedRoutesCount: 5 },
        poi: { relevanceSum: 6, eventsActive: false },
      }),
    );
    expect(sb.frequency).toBe(1);
    expect(sb.poiRelevance).toBe(1);
    // dfiStandfuss(0.3) + ticketautomat(0.1) + strom(0.2) + wartehaus(0.2) = 0.8
    expect(sb.infrastructure).toBeCloseTo(0.8, 4);
    expect(sb.weightedTotal).toBeCloseTo(0.5 * 1 + 0.3 * 1 + 0.2 * 0.8, 4);
  });
});

describe("computeConfidence", () => {
  it("startet bei knownFlags / 5", () => {
    expect(computeConfidence(makeInputs({ hardware: fullKnown }))).toBe(1);
    expect(
      computeConfidence(
        makeInputs({
          hardware: { ...allUnknown, dfiStandfuss: "YES" }, // 1/5 known
        }),
      ),
    ).toBeCloseTo(0.2, 2);
  });

  it("Site needsReview gibt −0.20", () => {
    expect(
      computeConfidence(
        makeInputs({ hardware: fullKnown, site: { needsReview: true } }),
      ),
    ).toBeCloseTo(0.8, 2);
  });

  it("ohne SiteHardwareInventory → 0", () => {
    expect(
      computeConfidence(
        makeInputs({ hardware: { ...allUnknown, hasInventory: false } }),
      ),
    ).toBe(0);
  });
});

describe("computeRecommendation", () => {
  it("liefert konsistentes Ergebnis bei Bellevue-ähnlichem Input", () => {
    const inputs = makeInputs({
      frequency: { weekdayDeparturesSum: 4000, servedRoutesCount: 16 },
      hardware: fullKnown,
    });
    const r = computeRecommendation(inputs);
    expect(r.elementSize).toBe("XXL");
    expect(r.elementCount).toBe(3); // routes ≥ 5
    expect(r.hardwareClass).toBe("A_REUSE_DFI_STANDALONE");
    expect(r.confidence).toBe(1);
    expect(r.ruleVersion).toBe(RULE_VERSION);
    expect(r.reasoning.length).toBeGreaterThanOrEqual(3);
    expect(r.inputsSnapshot).toEqual(inputs);
  });

  it("liefert G_UNKNOWN + leere reasoning-Details bei Site ohne Inventar", () => {
    const inputs = makeInputs({
      hardware: { ...allUnknown, hasInventory: false },
      frequency: { weekdayDeparturesSum: 0, servedRoutesCount: 0 },
    });
    const r = computeRecommendation(inputs);
    expect(r.hardwareClass).toBe("G_UNKNOWN");
    expect(r.confidence).toBe(0);
    expect(r.elementSize).toBe("S");
    expect(r.elementCount).toBe(1);
    expect(r.reasoning.some((s) => s.includes("G_UNKNOWN"))).toBe(true);
  });
});
