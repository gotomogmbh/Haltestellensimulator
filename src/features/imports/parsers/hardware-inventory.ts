import ExcelJS from "exceljs";
import Papa from "papaparse";

import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { normalizeYesNoUnknown } from "@/types/domain";

// ============================================================
// Column mapping (target field names follow snake_case as in the
// user-facing CSV/Excel; internal Prisma fields are camelCase).
// ============================================================

const REQUIRED_TARGETS = [
  "stop_name",
  "has_dfi_standalone",
  "has_dfi_on_power_pole",
  "has_ticket_machine",
  "has_power",
  "has_shelter",
] as const;

const OPTIONAL_TARGETS = [
  "municipality",
  "sloid",
  "zvv_stop_id",
  "vbz_stop_id",
  "notes",
] as const;

const ALL_TARGETS = [...REQUIRED_TARGETS, ...OPTIONAL_TARGETS] as const;
type Target = (typeof ALL_TARGETS)[number];

type FlagTarget =
  | "has_dfi_standalone"
  | "has_dfi_on_power_pole"
  | "has_ticket_machine"
  | "has_power"
  | "has_shelter";

const FLAG_TO_FIELD: Record<FlagTarget, "dfiStandfuss" | "dfiStrommast" | "ticketautomat" | "strom" | "wartehaus"> = {
  has_dfi_standalone: "dfiStandfuss",
  has_dfi_on_power_pole: "dfiStrommast",
  has_ticket_machine: "ticketautomat",
  has_power: "strom",
  has_shelter: "wartehaus",
};

type ErrorRecord = {
  rowNumber: number;
  field?: string;
  reason: string;
  rawValue?: string;
};

type Mapping = {
  entries: Array<{ sourceColumn: string; targetField: Target; sourceIndex: number }>;
  missingRequired: string[];
  get: (row: unknown[], target: Target) => unknown;
};

// ============================================================
// Public entry point — called from the upload action.
// ============================================================

export type HardwareInventoryRunArgs = {
  runId: string;
  fileId: string;
  storedPath: string;
  originalFilename: string;
};

export async function runHardwareInventoryImport(
  args: HardwareInventoryRunArgs,
): Promise<void> {
  const { runId, fileId, storedPath, originalFilename } = args;

  await prisma.importRun.update({
    where: { id: runId },
    data: { status: "PROCESSING" },
  });

  try {
    const buffer = await getStorage().read(storedPath);
    const rows = await readRows(buffer, originalFilename);

    if (rows.length < 2) {
      await prisma.importRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          rowsTotal: Math.max(0, rows.length - 1),
          summary: { error: "empty_file_or_no_data_rows" },
        },
      });
      return;
    }

    const headers = (rows[0] ?? []).map(normalizeHeader);
    const mapping = buildMapping(headers);

    if (mapping.missingRequired.length > 0) {
      await prisma.importRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          rowsTotal: rows.length - 1,
          summary: { error: "missing_required_columns", missingColumns: mapping.missingRequired },
        },
      });
      return;
    }

    if (mapping.entries.length > 0) {
      await prisma.importMapping.createMany({
        data: mapping.entries.map((e) => ({
          runId,
          sourceColumn: e.sourceColumn,
          targetField: e.targetField,
        })),
        skipDuplicates: true,
      });
    }

    let rowsAccepted = 0;
    let rowsRejected = 0;
    let sitesCreated = 0;
    let sitesMatched = 0;
    let needsReviewCount = 0;
    const errors: ErrorRecord[] = [];

    const dataRows = rows.slice(1);

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2;
      const row = dataRows[i] ?? [];

      try {
        const result = await processRow({ row, mapping, fileId, rowNumber });
        if (result.ok) {
          rowsAccepted++;
          if (result.created) sitesCreated++;
          else sitesMatched++;
          if (result.needsReview) needsReviewCount++;
          if (result.warnings) errors.push(...result.warnings);
        } else {
          rowsRejected++;
          errors.push(...result.errors);
        }
      } catch (err) {
        rowsRejected++;
        errors.push({
          rowNumber,
          reason: "unhandled_error",
          rawValue: String(err).slice(0, 200),
        });
      }
    }

    if (errors.length > 0) {
      await prisma.importError.createMany({
        data: errors.map((e) => ({ runId, ...e })),
      });
    }

    const status: "COMPLETED" | "NEEDS_REVIEW" | "FAILED" =
      rowsAccepted === 0
        ? "FAILED"
        : needsReviewCount > 0 || rowsRejected > 0
          ? "NEEDS_REVIEW"
          : "COMPLETED";

    await prisma.importRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: new Date(),
        rowsTotal: dataRows.length,
        rowsAccepted,
        rowsRejected,
        summary: { sitesCreated, sitesMatched, needsReviewCount },
      },
    });
  } catch (err) {
    await prisma.importRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        summary: { error: String(err).slice(0, 500) },
      },
    });
    throw err;
  }
}

// ============================================================
// File readers
// ============================================================

async function readRows(buffer: Buffer, filename: string): Promise<unknown[][]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    return readCsv(buffer, lower.endsWith(".tsv") ? "\t" : undefined);
  }
  return readExcel(buffer);
}

function readCsv(buffer: Buffer, delimiter?: string): unknown[][] {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<unknown[]>(text, {
    delimiter,
    skipEmptyLines: true,
  });
  return result.data;
}

async function readExcel(buffer: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS's `load` signature lags behind @types/node — its Buffer type
  // doesn't know about the newer generic. Runtime is fine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // exceljs row.values is 1-indexed with `undefined` at index 0
    const values = (row.values as unknown[]).slice(1);
    rows.push(values);
  });
  return rows;
}

// ============================================================
// Mapping
// ============================================================

function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
}

function buildMapping(headers: string[]): Mapping {
  const entries: Mapping["entries"] = [];
  const missingRequired: string[] = [];

  for (const target of ALL_TARGETS) {
    const idx = headers.indexOf(target);
    if (idx === -1) {
      if ((REQUIRED_TARGETS as readonly string[]).includes(target)) {
        missingRequired.push(target);
      }
      continue;
    }
    entries.push({
      sourceColumn: headers[idx] ?? target,
      targetField: target,
      sourceIndex: idx,
    });
  }

  return {
    entries,
    missingRequired,
    get(row, target) {
      const entry = entries.find((e) => e.targetField === target);
      return entry ? row[entry.sourceIndex] : undefined;
    },
  };
}

// ============================================================
// Per-row processing
// ============================================================

type ProcessResult =
  | {
      ok: true;
      created: boolean;
      needsReview: boolean;
      warnings?: ErrorRecord[];
    }
  | { ok: false; errors: ErrorRecord[] };

async function processRow(args: {
  row: unknown[];
  mapping: Mapping;
  fileId: string;
  rowNumber: number;
}): Promise<ProcessResult> {
  const { row, mapping, fileId, rowNumber } = args;
  const errors: ErrorRecord[] = [];

  const get = (target: Target) => mapping.get(row, target);
  const str = (target: Target): string | null => {
    const v = get(target);
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  const stopName = str("stop_name");
  if (!stopName) {
    errors.push({ rowNumber, field: "stop_name", reason: "required_missing" });
    return { ok: false, errors };
  }
  const municipality = str("municipality");
  const sloid = str("sloid");
  const zvvStopId = str("zvv_stop_id");
  const vbzStopId = str("vbz_stop_id");
  const notes = str("notes");

  // Normalize flag values
  const flagTargets: FlagTarget[] = [
    "has_dfi_standalone",
    "has_dfi_on_power_pole",
    "has_ticket_machine",
    "has_power",
    "has_shelter",
  ];
  const flagValues: Partial<Record<FlagTarget, "YES" | "NO" | "UNKNOWN">> = {};
  let hasUnmappable = false;

  for (const t of flagTargets) {
    const raw = get(t);
    const value = normalizeYesNoUnknown(raw as string | number | boolean | null | undefined);
    if (value === null) {
      errors.push({
        rowNumber,
        field: t,
        reason: "value_not_mappable",
        rawValue: String(raw ?? "").slice(0, 200),
      });
      hasUnmappable = true;
    } else {
      flagValues[t] = value;
    }
  }
  if (hasUnmappable) return { ok: false, errors };

  // ----- Site matching (sloid → zvv_stop_id → vbz_stop_id → name+municipality)
  let site = null as Awaited<ReturnType<typeof prisma.site.findUnique>> | null;
  if (sloid) site = await prisma.site.findUnique({ where: { sloid } });
  if (!site && zvvStopId) site = await prisma.site.findUnique({ where: { zvvStopId } });
  if (!site && vbzStopId) site = await prisma.site.findUnique({ where: { vbzStopId } });
  if (!site) {
    site = await prisma.site.findFirst({
      where: {
        name: stopName,
        ...(municipality ? { municipality } : {}),
      },
    });
  }

  const warnings: ErrorRecord[] = [];
  let created = false;
  let needsReview = false;

  if (!site) {
    site = await prisma.site.create({
      data: {
        name: stopName,
        municipality,
        sloid,
        zvvStopId,
        vbzStopId,
        operatorArea: "UNKNOWN",
        needsReview: true,
        notes:
          "Aus Hardware-Inventar-Import angelegt; kein vorhandener Site-Match. Bitte mit GTFS / DiDok abgleichen.",
      },
    });
    created = true;
    needsReview = true;
    warnings.push({
      rowNumber,
      reason: "site_created_needs_review",
      rawValue: `${stopName}${municipality ? " / " + municipality : ""}`,
    });
  }

  // Upsert hardware inventory
  await prisma.siteHardwareInventory.upsert({
    where: { siteId: site.id },
    create: {
      siteId: site.id,
      dfiStandfuss: flagValues.has_dfi_standalone!,
      dfiStrommast: flagValues.has_dfi_on_power_pole!,
      ticketautomat: flagValues.has_ticket_machine!,
      strom: flagValues.has_power!,
      wartehaus: flagValues.has_shelter!,
      notes,
      sourceImportFileId: fileId,
      recordedAt: new Date(),
    },
    update: {
      dfiStandfuss: flagValues.has_dfi_standalone!,
      dfiStrommast: flagValues.has_dfi_on_power_pole!,
      ticketautomat: flagValues.has_ticket_machine!,
      strom: flagValues.has_power!,
      wartehaus: flagValues.has_shelter!,
      notes,
      sourceImportFileId: fileId,
      recordedAt: new Date(),
    },
  });

  return {
    ok: true,
    created,
    needsReview,
    warnings: warnings.length ? warnings : undefined,
  };
}

// Avoid TS-unused warning since FLAG_TO_FIELD is documentation-only.
export const _HARDWARE_INVENTORY_FLAG_MAP = FLAG_TO_FIELD;
