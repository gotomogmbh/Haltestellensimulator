/**
 * Scoring-Engine — pure functions, deterministisch.
 *
 * Eingaben siehe `ScoringInputs`. Outputs gemäss docs/scoring.md.
 *
 * Diese Datei kennt die Datenbank nicht. Persistenz + Aggregation der Inputs
 * lebt in `run.ts`.
 */

import type {
  ElementSize,
  HardwareIntegrationClass,
  ScoreBreakdown,
  YesNoUnknown,
} from "@/types/domain";

export const RULE_VERSION = "scoring@0.3.0";

// ============================================================
// Inputs / Outputs
// ============================================================

export type HardwareInput = {
  dfiStandfuss: YesNoUnknown;
  dfiStrommast: YesNoUnknown;
  ticketautomat: YesNoUnknown;
  strom: YesNoUnknown;
  wartehaus: YesNoUnknown;
  /** Liegt überhaupt ein `SiteHardwareInventory`-Record vor? */
  hasInventory: boolean;
};

export type FrequencyInput = {
  weekdayDeparturesSum: number;
  servedRoutesCount: number;
};

export type PoiInput = {
  relevanceSum: number;
  eventsActive: boolean;
};

export type ScoringInputs = {
  hardware: HardwareInput;
  frequency: FrequencyInput;
  poi: PoiInput;
  site: { needsReview: boolean };
};

export type RecommendationResult = {
  elementSize: ElementSize;
  elementCount: number;
  hardwareClass: HardwareIntegrationClass;
  scoreBreakdown: ScoreBreakdown;
  confidence: number;
  reasoning: string[];
  inputsSnapshot: ScoringInputs;
  ruleVersion: string;
};

// ============================================================
// Hardware-Klasse (erste passende Regel gewinnt)
// ============================================================

export function classifyHardware(h: HardwareInput): HardwareIntegrationClass {
  if (!h.hasInventory) return "G_UNKNOWN";
  const allUnknown =
    h.dfiStandfuss === "UNKNOWN" &&
    h.dfiStrommast === "UNKNOWN" &&
    h.ticketautomat === "UNKNOWN" &&
    h.strom === "UNKNOWN" &&
    h.wartehaus === "UNKNOWN";
  if (allUnknown) return "G_UNKNOWN";

  if (h.dfiStandfuss === "YES") return "A_REUSE_DFI_STANDALONE";
  if (h.dfiStrommast === "YES") return "B_REUSE_DFI_POLE";
  if (h.ticketautomat === "YES") return "C_REUSE_TICKET_MACHINE";
  if (h.wartehaus === "YES") return "D_REUSE_SHELTER";
  if (h.strom === "YES") return "E_POWER_AVAILABLE_NEW_MOUNT";
  if (h.strom === "NO" && h.wartehaus === "NO") return "F_NO_HARDWARE";
  return "G_UNKNOWN";
}

export function listUnknownFlags(h: HardwareInput): string[] {
  const out: string[] = [];
  if (h.dfiStandfuss === "UNKNOWN") out.push("DFI Standfuss");
  if (h.dfiStrommast === "UNKNOWN") out.push("DFI Strommast");
  if (h.ticketautomat === "UNKNOWN") out.push("Ticketautomat");
  if (h.strom === "UNKNOWN") out.push("Strom");
  if (h.wartehaus === "UNKNOWN") out.push("Wartehaus");
  return out;
}

// ============================================================
// Elementgrösse
// ============================================================

const SIZES: readonly ElementSize[] = ["S", "M", "L", "XL", "XXL"] as const;

export function baseElementSize(weekdayDeparturesSum: number): ElementSize {
  if (weekdayDeparturesSum >= 1000) return "XXL";
  if (weekdayDeparturesSum >= 500) return "XL";
  if (weekdayDeparturesSum >= 200) return "L";
  if (weekdayDeparturesSum >= 50) return "M";
  return "S";
}

export function poiSizeShift(poi: PoiInput): number {
  let shift = poi.relevanceSum >= 6.0 ? 2 : poi.relevanceSum >= 3.0 ? 1 : 0;
  if (poi.eventsActive) shift += 1;
  return shift;
}

export function shiftSize(base: ElementSize, shift: number): ElementSize {
  const idx = SIZES.indexOf(base);
  const next = Math.max(0, Math.min(SIZES.length - 1, idx + shift));
  return SIZES[next]!;
}

export function computeElementSize(
  freq: FrequencyInput,
  hardware: HardwareInput,
  poi: PoiInput,
): ElementSize {
  let size = baseElementSize(freq.weekdayDeparturesSum);
  const shift = poiSizeShift(poi);
  if (shift !== 0) size = shiftSize(size, shift);
  // Ohne Wartefläche keine grossen statischen Tafeln sinnvoll.
  if (hardware.wartehaus === "NO" && (size === "XL" || size === "XXL")) {
    size = shiftSize(size, -1);
  }
  return size;
}

// ============================================================
// Anzahl Elemente
// ============================================================

export function computeElementCount(
  size: ElementSize,
  freq: FrequencyInput,
  poi: PoiInput,
): number {
  let count: number;
  switch (size) {
    case "S":
    case "M":
      count = 1;
      break;
    case "L":
      count = freq.servedRoutesCount >= 3 ? 2 : 1;
      break;
    case "XL":
      count = 2;
      break;
    case "XXL":
      count = freq.servedRoutesCount >= 5 || poi.eventsActive ? 3 : 2;
      break;
  }
  // POI-Hotspot-Bonus
  if (poi.relevanceSum >= 6.0) count = Math.min(count + 1, 4);
  return count;
}

// ============================================================
// Score-Aufteilung
// ============================================================

const INFRA_WEIGHTS: Record<keyof Omit<HardwareInput, "hasInventory">, number> = {
  dfiStandfuss: 0.3,
  dfiStrommast: 0.2,
  wartehaus: 0.2,
  strom: 0.2,
  ticketautomat: 0.1,
};

export function frequencyScore(weekdayDeparturesSum: number): number {
  const d = Math.max(weekdayDeparturesSum, 1);
  return Math.min(1, Math.log10(d) / 3);
}

export function poiScore(poi: PoiInput): number {
  return clamp(0, 1, poi.relevanceSum / 6 + (poi.eventsActive ? 0.1 : 0));
}

export function infrastructureScore(h: HardwareInput): number {
  let s = 0;
  if (h.dfiStandfuss === "YES") s += INFRA_WEIGHTS.dfiStandfuss;
  if (h.dfiStrommast === "YES") s += INFRA_WEIGHTS.dfiStrommast;
  if (h.wartehaus === "YES") s += INFRA_WEIGHTS.wartehaus;
  if (h.strom === "YES") s += INFRA_WEIGHTS.strom;
  if (h.ticketautomat === "YES") s += INFRA_WEIGHTS.ticketautomat;
  return clamp(0, 1, s);
}

export function computeScoreBreakdown(inputs: ScoringInputs): ScoreBreakdown {
  const frequency = frequencyScore(inputs.frequency.weekdayDeparturesSum);
  const poiRelevance = poiScore(inputs.poi);
  const infrastructure = infrastructureScore(inputs.hardware);
  const rawTotal = frequency + poiRelevance + infrastructure;
  const weightedTotal =
    0.5 * frequency + 0.3 * poiRelevance + 0.2 * infrastructure;
  return {
    frequency: round(frequency, 4),
    poiRelevance: round(poiRelevance, 4),
    infrastructure: round(infrastructure, 4),
    rawTotal: round(rawTotal, 4),
    weightedTotal: round(weightedTotal, 4),
  };
}

// ============================================================
// Confidence
// ============================================================

export function computeConfidence(inputs: ScoringInputs): number {
  if (!inputs.hardware.hasInventory) return 0;
  const h = inputs.hardware;
  const known = [
    h.dfiStandfuss,
    h.dfiStrommast,
    h.ticketautomat,
    h.strom,
    h.wartehaus,
  ].filter((v) => v !== "UNKNOWN").length;

  let conf = known / 5;
  if (inputs.site.needsReview) conf -= 0.2;
  // Date-basierte Abzüge (GTFS älter als 90 Tage, HW-Inventar älter als 12
  // Monate, POIs älter als 12 Monate) fehlen im MVP, weil wir die Freshness
  // noch nicht tracken. Diese kommen in einem zweiten Schritt.
  return clamp(0, 1, round(conf, 2));
}

// ============================================================
// Begründung
// ============================================================

export function buildReasoning(
  inputs: ScoringInputs,
  result: Pick<
    RecommendationResult,
    "elementSize" | "elementCount" | "hardwareClass" | "confidence"
  >,
): string[] {
  const lines: string[] = [];

  // Grösse
  const f = inputs.frequency.weekdayDeparturesSum;
  const base = baseElementSize(f);
  const sizeShift = poiSizeShift(inputs.poi);
  const wartehausDown =
    inputs.hardware.wartehaus === "NO" &&
    (shiftSize(base, sizeShift) === "XL" || shiftSize(base, sizeShift) === "XXL")
      ? 1
      : 0;

  lines.push(
    `Empfohlene Grösse ${result.elementSize}: ${f} Abfahrten/Werktag` +
      ` (Basis ${base}` +
      (sizeShift > 0 ? `, +${sizeShift} durch POI-Relevanz` : "") +
      (wartehausDown > 0 ? `, −1 weil kein Wartehaus` : "") +
      `).`,
  );

  // POI
  if (inputs.poi.relevanceSum > 0 || inputs.poi.eventsActive) {
    const parts: string[] = [
      `POI-Relevanz im 300-m-Radius: ${inputs.poi.relevanceSum.toFixed(1)}`,
    ];
    if (inputs.poi.eventsActive) parts.push("Event aktiv");
    lines.push(parts.join(" · ") + ".");
  }

  // Anzahl
  lines.push(
    `Anzahl: ${result.elementCount} (Linien: ${inputs.frequency.servedRoutesCount}` +
      (inputs.poi.relevanceSum >= 6 ? `, POI-Hotspot` : "") +
      `).`,
  );

  // Hardware-Klasse
  const hwLabel = describeHardwareClass(result.hardwareClass);
  if (result.hardwareClass === "G_UNKNOWN") {
    const unknown = listUnknownFlags(inputs.hardware);
    if (unknown.length > 0) {
      lines.push(
        `Hardware-Klasse G_UNKNOWN: Datenlage unzureichend (unbekannt: ${unknown.join(", ")}).`,
      );
    } else {
      lines.push("Hardware-Klasse G_UNKNOWN: keine SiteHardwareInventory-Daten vorhanden.");
    }
  } else {
    lines.push(`Hardware-Klasse ${result.hardwareClass}: ${hwLabel}.`);
  }

  // Confidence
  const knownCount = inputs.hardware.hasInventory
    ? [
        inputs.hardware.dfiStandfuss,
        inputs.hardware.dfiStrommast,
        inputs.hardware.ticketautomat,
        inputs.hardware.strom,
        inputs.hardware.wartehaus,
      ].filter((v) => v !== "UNKNOWN").length
    : 0;
  lines.push(
    `Confidence ${result.confidence.toFixed(2)}: ${knownCount}/5 Pflichtmerkmale bekannt` +
      (inputs.site.needsReview ? ", Site needsReview (Abzug −0.20)" : "") +
      `.`,
  );

  return lines;
}

function describeHardwareClass(c: HardwareIntegrationClass): string {
  switch (c) {
    case "A_REUSE_DFI_STANDALONE":
      return "DFI mit Standfuss vorhanden, kann wiederverwendet werden";
    case "B_REUSE_DFI_POLE":
      return "DFI am Strommast vorhanden, kann wiederverwendet werden";
    case "C_REUSE_TICKET_MACHINE":
      return "Ticketautomat vorhanden, Infrastruktur nutzbar";
    case "D_REUSE_SHELTER":
      return "Wartehaus vorhanden, Integration möglich";
    case "E_POWER_AVAILABLE_NEW_MOUNT":
      return "Strom vorhanden, neue Halterung erforderlich";
    case "F_NO_HARDWARE":
      return "weder Strom noch Infrastruktur, Neubau oder Autarkielösung";
    case "G_UNKNOWN":
      return "Datenlage unzureichend";
  }
}

// ============================================================
// Composer
// ============================================================

export function computeRecommendation(inputs: ScoringInputs): RecommendationResult {
  const elementSize = computeElementSize(
    inputs.frequency,
    inputs.hardware,
    inputs.poi,
  );
  const elementCount = computeElementCount(elementSize, inputs.frequency, inputs.poi);
  const hardwareClass = classifyHardware(inputs.hardware);
  const scoreBreakdown = computeScoreBreakdown(inputs);
  const confidence = computeConfidence(inputs);
  const reasoning = buildReasoning(inputs, {
    elementSize,
    elementCount,
    hardwareClass,
    confidence,
  });
  return {
    elementSize,
    elementCount,
    hardwareClass,
    scoreBreakdown,
    confidence,
    reasoning,
    inputsSnapshot: inputs,
    ruleVersion: RULE_VERSION,
  };
}

// ============================================================
// Helpers
// ============================================================

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
