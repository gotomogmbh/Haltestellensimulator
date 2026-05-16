"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import type { StorageKind } from "@/lib/storage";
import { ImportType, type ImportType as ImportTypeT } from "@/types/domain";
import { runGtfsImport } from "./parsers/gtfs";
import { runHardwareInventoryImport } from "./parsers/hardware-inventory";

const IMPORT_TYPE_TO_STORAGE_KIND: Record<ImportTypeT, StorageKind> = {
  GTFS_STATIC: "gtfs",
  HARDWARE_INVENTORY: "excel",
  POI_EVENT_LOCATIONS: "poi",
  PASSENGER_COUNTS: "excel",
  MANUAL_SITE_ATTRIBUTES: "excel",
  OTHER: "excel",
};

const MAX_BYTES_BY_TYPE: Record<ImportTypeT, number> = {
  GTFS_STATIC: 500 * 1024 * 1024,
  HARDWARE_INVENTORY: 25 * 1024 * 1024,
  POI_EVENT_LOCATIONS: 25 * 1024 * 1024,
  PASSENGER_COUNTS: 50 * 1024 * 1024,
  MANUAL_SITE_ATTRIBUTES: 25 * 1024 * 1024,
  OTHER: 50 * 1024 * 1024,
};

export type UploadResult =
  | { ok: true; fileId: string; runId: string; duplicate: boolean }
  | { ok: false; error: string };

export async function uploadImportFile(
  _prevState: UploadResult | null,
  formData: FormData,
): Promise<UploadResult> {
  const file = formData.get("file");
  const importTypeRaw = formData.get("importType");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Keine Datei ausgewählt oder Datei ist leer." };
  }

  const parsed = ImportType.safeParse(importTypeRaw);
  if (!parsed.success) {
    return { ok: false, error: "Ungültiger Import-Typ." };
  }
  const importType = parsed.data;

  const maxBytes = MAX_BYTES_BY_TYPE[importType];
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `Datei ist zu gross (max. ${Math.round(maxBytes / 1024 / 1024)} MB für ${importType}).`,
    };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const kind = IMPORT_TYPE_TO_STORAGE_KIND[importType];
  const stored = await getStorage().save(kind, file.name || "upload", buffer);

  // Idempotenz: gleicher contentHash → ImportFile wiederverwenden
  const existing = await prisma.importFile.findUnique({
    where: { contentHash: stored.contentHash },
  });

  let fileId: string;
  let duplicate = false;

  if (existing) {
    fileId = existing.id;
    duplicate = true;
  } else {
    const created = await prisma.importFile.create({
      data: {
        importType,
        originalFilename: file.name || "upload",
        storedPath: stored.storedPath,
        mimeType: file.type || null,
        sizeBytes: stored.sizeBytes,
        contentHash: stored.contentHash,
      },
    });
    fileId = created.id;
  }

  const run = await prisma.importRun.create({
    data: {
      fileId,
      status: "UPLOADED",
      summary: duplicate
        ? {
            note: "Existierende Datei (gleicher contentHash) erneut hochgeladen. Kein Re-Process ohne expliziten Flag.",
          }
        : undefined,
    },
  });

  // For known parsers, run synchronously after upload. Failures are
  // recorded on the ImportRun itself, so we don't surface them as
  // action errors here.
  if (!duplicate) {
    const parserArgs = {
      runId: run.id,
      fileId,
      storedPath: stored.storedPath,
      originalFilename: file.name || "upload",
    };
    try {
      if (importType === "HARDWARE_INVENTORY") {
        await runHardwareInventoryImport(parserArgs);
      } else if (importType === "GTFS_STATIC") {
        await runGtfsImport(parserArgs);
      }
    } catch {
      // ImportRun.status was already set to FAILED by the parser.
    }
  }

  revalidatePath("/imports");

  return { ok: true, fileId, runId: run.id, duplicate };
}
