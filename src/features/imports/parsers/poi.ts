import ExcelJS from "exceljs";
import Papa from "papaparse";

import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { PoiRelevance, type PoiRelevance as PoiRelevanceT } from "@/types/domain";

const POI_RADIUS_METERS = 300;
// ±0.005° at Zurich latitude (~47°N) covers ~555 m latitude / ~378 m longitude
// — generous bounding box, exact haversine narrows it down per row.
const BBOX_DELTA = 0.005;
const POI_INSERT_BATCH = 500;

const REQUIRED_TARGETS = ["name"] as const;
const OPTIONAL_TARGETS = [
  "poi_type",
  "address",
  "latitude",
  "longitude",
  "relevance_level",
  "event_relevance",
  "source",
  "notes",
  "valid_from",
  "valid_to",
] as const;
const ALL_TARGETS = [...REQUIRED_TARGETS, ...OPTIONAL_TARGETS] as const;
type Target = (typeof ALL_TARGETS)[number];

type Mapping = {
  entries: Array<{ sourceColumn: string; targetField: Target; sourceIndex: number }>;
  missingRequired: string[];
  get: (row: unknown[], target: Target) => unknown;
};

type ErrorRecord = {
  rowNumber: number;
  field?: string;
  reason: string;
  rawValue?: string;
};

export type PoiRunArgs = {
  runId: string;
  fileId: string;
  storedPath: string;
  originalFilename: string;
};

export async function runPoiImport(args: PoiRunArgs): Promise<void> {
  const { runId, fileId, storedPath, originalFilename } = args;

  await prisma.importRun.update({
    where: { id: runId },
    data: { status: "PROCESSING" },
  });

  try {
    const buffer = await getStorage().read(storedPath);
    const rows = await readRows(buffer, originalFilename);

    if (rows.length < 2) {
      await failRun(runId, "empty_file_or_no_data_rows", Math.max(0, rows.length - 1));
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
          summary: {
            error: "missing_required_columns",
            missingColumns: mapping.missingRequired,
          },
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

    const dataRows = rows.slice(1);
    const errors: ErrorRecord[] = [];
    type PoiCreate = {
      name: string;
      category: string | null;
      relevance: PoiRelevanceT;
      latitude: number;
      longitude: number;
      address: string | null;
      validFrom: Date | null;
      validTo: Date | null;
      notes: string | null;
      sourceImportFileId: string;
    };
    const toInsert: PoiCreate[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2;
      const row = dataRows[i] ?? [];

      const get = (t: Target) => mapping.get(row, t);
      const str = (t: Target): string | null => {
        const v = get(t);
        if (v == null) return null;
        const s = String(v).trim();
        return s ? s : null;
      };

      const name = str("name");
      if (!name) {
        errors.push({ rowNumber, field: "name", reason: "required_missing" });
        continue;
      }

      const latRaw = str("latitude");
      const lonRaw = str("longitude");
      const lat = latRaw ? Number.parseFloat(latRaw.replace(",", ".")) : NaN;
      const lon = lonRaw ? Number.parseFloat(lonRaw.replace(",", ".")) : NaN;

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        const address = str("address");
        if (address) {
          errors.push({
            rowNumber,
            field: "latitude_longitude",
            reason: "needs_geocoding",
            rawValue: address,
          });
        } else {
          errors.push({
            rowNumber,
            field: "latitude_longitude",
            reason: "required_missing",
          });
        }
        continue;
      }
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        errors.push({
          rowNumber,
          field: "latitude_longitude",
          reason: "out_of_range",
          rawValue: `${lat},${lon}`,
        });
        continue;
      }

      const relevanceRaw = str("relevance_level");
      const relevance = relevanceRaw
        ? PoiRelevance.safeParse(relevanceRaw.toUpperCase()).data
        : undefined;
      if (relevanceRaw && !relevance) {
        errors.push({
          rowNumber,
          field: "relevance_level",
          reason: "value_not_mappable",
          rawValue: relevanceRaw,
        });
        continue;
      }

      const noteParts: string[] = [];
      const eventRel = str("event_relevance");
      const source = str("source");
      const notes = str("notes");
      if (eventRel) noteParts.push(`event: ${eventRel}`);
      if (source) noteParts.push(`source: ${source}`);
      if (notes) noteParts.push(notes);

      toInsert.push({
        name,
        category: str("poi_type"),
        relevance: relevance ?? "MEDIUM",
        latitude: lat,
        longitude: lon,
        address: str("address"),
        validFrom: parseDate(str("valid_from")),
        validTo: parseDate(str("valid_to")),
        notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
        sourceImportFileId: fileId,
      });
    }

    // -------- Insert POIs, capture IDs --------
    const createdPois: Array<{
      id: string;
      latitude: number;
      longitude: number;
    }> = [];
    for (let i = 0; i < toInsert.length; i += POI_INSERT_BATCH) {
      const batch = toInsert.slice(i, i + POI_INSERT_BATCH);
      // createManyAndReturn ist seit Prisma 5.14 verfügbar — gibt uns die IDs
      // ohne separates findMany.
      const inserted = await prisma.pointOfInterest.createManyAndReturn({
        data: batch,
        select: { id: true, latitude: true, longitude: true },
      });
      createdPois.push(...inserted);
    }

    // -------- Compute Site relations (300 m radius, haversine) --------
    let relationsCreated = 0;
    for (const poi of createdPois) {
      const candidates = await prisma.site.findMany({
        where: {
          latitude: {
            gte: poi.latitude - BBOX_DELTA,
            lte: poi.latitude + BBOX_DELTA,
          },
          longitude: {
            gte: poi.longitude - BBOX_DELTA,
            lte: poi.longitude + BBOX_DELTA,
          },
        },
        select: { id: true, latitude: true, longitude: true },
      });

      const relations: Array<{
        siteId: string;
        poiId: string;
        distanceMeters: number;
      }> = [];
      for (const site of candidates) {
        if (site.latitude == null || site.longitude == null) continue;
        const d = haversineMeters(
          poi.latitude,
          poi.longitude,
          site.latitude,
          site.longitude,
        );
        if (d <= POI_RADIUS_METERS) {
          relations.push({
            siteId: site.id,
            poiId: poi.id,
            distanceMeters: Math.round(d * 10) / 10,
          });
        }
      }

      if (relations.length > 0) {
        const r = await prisma.sitePoiRelation.createMany({
          data: relations,
          skipDuplicates: true,
        });
        relationsCreated += r.count;
      }
    }

    if (errors.length > 0) {
      await prisma.importError.createMany({
        data: errors.map((e) => ({ runId, ...e })),
      });
    }

    const status: "COMPLETED" | "NEEDS_REVIEW" | "FAILED" =
      createdPois.length === 0
        ? "FAILED"
        : errors.length > 0
          ? "NEEDS_REVIEW"
          : "COMPLETED";

    await prisma.importRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: new Date(),
        rowsTotal: dataRows.length,
        rowsAccepted: createdPois.length,
        rowsRejected: errors.length,
        summary: {
          poisCreated: createdPois.length,
          siteRelationsCreated: relationsCreated,
          radiusMeters: POI_RADIUS_METERS,
        },
      },
    });
  } catch (err) {
    await failRun(runId, String(err).slice(0, 500), undefined);
    throw err;
  }
}

// ============================================================
// Helpers
// ============================================================

async function failRun(
  runId: string,
  error: string,
  rowsTotal: number | undefined,
): Promise<void> {
  await prisma.importRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      ...(rowsTotal != null ? { rowsTotal } : {}),
      summary: { error },
    },
  });
}

async function readRows(buffer: Buffer, filename: string): Promise<unknown[][]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const text = buffer.toString("utf-8");
    const r = Papa.parse<unknown[]>(text, {
      delimiter: lower.endsWith(".tsv") ? "\t" : undefined,
      skipEmptyLines: true,
    });
    return r.data;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    buffer as unknown as Parameters<typeof wb.xlsx.load>[0],
  );
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push((row.values as unknown[]).slice(1));
  });
  return rows;
}

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

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
