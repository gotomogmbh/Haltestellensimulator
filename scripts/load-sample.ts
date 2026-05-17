/**
 * Lädt eine Datei aus data/samples/ in den Storage, erstellt ImportFile +
 * ImportRun und ruft den passenden Parser auf. Umgeht das Web-UI für
 * automatisierte Verifizierung.
 *
 *   pnpm tsx scripts/load-sample.ts <filename-in-data-samples> <importType>
 *
 * Beispiel:
 *   pnpm tsx scripts/load-sample.ts poi_event_locations_sample.csv POI_EVENT_LOCATIONS
 */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { prisma } from "../src/lib/db";
import { getStorage } from "../src/lib/storage";
import { runGtfsImport } from "../src/features/imports/parsers/gtfs";
import { runHardwareInventoryImport } from "../src/features/imports/parsers/hardware-inventory";
import { runPoiImport } from "../src/features/imports/parsers/poi";
import { ImportType } from "../src/types/domain";

const fileArg = process.argv[2];
const typeArg = process.argv[3];

async function main() {
  if (!fileArg || !typeArg) {
    throw new Error(
      "Usage: pnpm tsx scripts/load-sample.ts <filename> <importType>",
    );
  }
  const importType = ImportType.parse(typeArg);

  const absolutePath = resolve("data/samples", fileArg);
  const buffer = await readFile(absolutePath);

  const storageKind =
    importType === "GTFS_STATIC"
      ? ("gtfs" as const)
      : importType === "POI_EVENT_LOCATIONS"
        ? ("poi" as const)
        : ("excel" as const);

  const stored = await getStorage().save(
    storageKind,
    basename(absolutePath),
    buffer,
  );

  let file = await prisma.importFile.findUnique({
    where: { contentHash: stored.contentHash },
  });
  if (!file) {
    file = await prisma.importFile.create({
      data: {
        importType,
        originalFilename: basename(absolutePath),
        storedPath: stored.storedPath,
        mimeType: fileArg.endsWith(".csv") ? "text/csv" : null,
        sizeBytes: stored.sizeBytes,
        contentHash: stored.contentHash,
        uploadedBy: "load-sample",
      },
    });
  } else {
    console.log(`ImportFile already existed (contentHash match): ${file.id}`);
  }

  const run = await prisma.importRun.create({
    data: { fileId: file.id, status: "PROCESSING" },
  });
  console.log(`Run ${run.id} → ${importType} → ${basename(absolutePath)}`);

  const args = {
    runId: run.id,
    fileId: file.id,
    storedPath: stored.storedPath,
    originalFilename: basename(absolutePath),
  };

  switch (importType) {
    case "GTFS_STATIC":
      await runGtfsImport(args);
      break;
    case "HARDWARE_INVENTORY":
      await runHardwareInventoryImport(args);
      break;
    case "POI_EVENT_LOCATIONS":
      await runPoiImport(args);
      break;
    default:
      throw new Error(`No parser wired for importType=${importType}`);
  }

  const finalRun = await prisma.importRun.findUnique({ where: { id: run.id } });
  console.log("Done:", {
    status: finalRun?.status,
    rowsTotal: finalRun?.rowsTotal,
    rowsAccepted: finalRun?.rowsAccepted,
    rowsRejected: finalRun?.rowsRejected,
    summary: finalRun?.summary,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
