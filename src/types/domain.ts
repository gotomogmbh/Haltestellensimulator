import { z } from "zod";

// ============================================================
// Enum-Schemas — spiegeln 1:1 die Prisma-Enums in schema.prisma
// ============================================================

export const YesNoUnknown = z.enum(["YES", "NO", "UNKNOWN"]);
export type YesNoUnknown = z.infer<typeof YesNoUnknown>;

export const ElementSize = z.enum(["S", "M", "L", "XL", "XXL"]);
export type ElementSize = z.infer<typeof ElementSize>;

export const HardwareIntegrationClass = z.enum([
  "A_REUSE_DFI_STANDALONE",
  "B_REUSE_DFI_POLE",
  "C_REUSE_TICKET_MACHINE",
  "D_REUSE_SHELTER",
  "E_POWER_AVAILABLE_NEW_MOUNT",
  "F_NO_HARDWARE",
  "G_UNKNOWN",
]);
export type HardwareIntegrationClass = z.infer<typeof HardwareIntegrationClass>;

export const ImportStatus = z.enum([
  "UPLOADED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "NEEDS_REVIEW",
]);
export type ImportStatus = z.infer<typeof ImportStatus>;

export const ImportType = z.enum([
  "GTFS_STATIC",
  "HARDWARE_INVENTORY",
  "POI_EVENT_LOCATIONS",
  "PASSENGER_COUNTS",
  "MANUAL_SITE_ATTRIBUTES",
  "OTHER",
]);
export type ImportType = z.infer<typeof ImportType>;

export const OperatorArea = z.enum(["VBZ", "ZVV", "MIXED", "UNKNOWN"]);
export type OperatorArea = z.infer<typeof OperatorArea>;

export const PoiRelevance = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type PoiRelevance = z.infer<typeof PoiRelevance>;

// ============================================================
// Geo
// ============================================================

export const Coordinate = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
});
export type Coordinate = z.infer<typeof Coordinate>;

// ============================================================
// Hardware-Inventar (Pflicht-Flags)
// ============================================================

export const SiteHardwareInventoryInput = z.object({
  dfiStandfuss: YesNoUnknown.default("UNKNOWN"),
  dfiStrommast: YesNoUnknown.default("UNKNOWN"),
  ticketautomat: YesNoUnknown.default("UNKNOWN"),
  strom: YesNoUnknown.default("UNKNOWN"),
  wartehaus: YesNoUnknown.default("UNKNOWN"),
  notes: z.string().nullish(),
  recordedAt: z.coerce.date().nullish(),
});
export type SiteHardwareInventoryInput = z.infer<
  typeof SiteHardwareInventoryInput
>;

// ============================================================
// Recommendation — Shape von Recommendation.scoreBreakdown (JSONB)
// ============================================================

export const ScoreBreakdown = z.object({
  frequency: z.number(),
  poiRelevance: z.number(),
  infrastructure: z.number(),
  rawTotal: z.number(),
  weightedTotal: z.number(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

// ============================================================
// Excel/CSV Cell-Normalisierung
// ============================================================

const YES_ALIASES = new Set([
  "yes",
  "ja",
  "y",
  "j",
  "1",
  "true",
  "wahr",
  "x",
]);
const NO_ALIASES = new Set([
  "no",
  "nein",
  "n",
  "0",
  "false",
  "falsch",
]);
const UNKNOWN_ALIASES = new Set([
  "",
  "?",
  "unknown",
  "unbekannt",
  "n/a",
  "na",
  "k.a.",
  "ka",
  "-",
]);

/**
 * Übersetzt freie Excel-Werte in einen `YesNoUnknown`-Wert.
 * Liefert `null`, wenn der Wert nicht eindeutig zuordenbar ist — die Pipeline
 * legt in dem Fall einen `ImportError` mit `reason = "value_not_mappable"` an.
 */
export function normalizeYesNoUnknown(
  raw: string | number | boolean | null | undefined,
): YesNoUnknown | null {
  if (raw == null) return "UNKNOWN";
  const v = String(raw).trim().toLowerCase();
  if (YES_ALIASES.has(v)) return "YES";
  if (NO_ALIASES.has(v)) return "NO";
  if (UNKNOWN_ALIASES.has(v)) return "UNKNOWN";
  return null;
}
