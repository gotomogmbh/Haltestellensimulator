/**
 * One-shot reprocess of an already-uploaded ImportFile.
 *
 *   pnpm tsx scripts/reprocess-import.ts <fileId> [step]
 *
 *   step (only relevant for GTFS_STATIC):
 *     stops      — only the Site-level import (default)
 *     lines      — only routes + frequencies (needs stops to exist)
 *     all        — stops, then lines
 *
 * Creates a new ImportRun and runs the parser for the file's importType.
 */
import { prisma } from "../src/lib/db";
import { runGtfsImport } from "../src/features/imports/parsers/gtfs";
import { runGtfsLinesImport } from "../src/features/imports/parsers/gtfs-lines";
import { runHardwareInventoryImport } from "../src/features/imports/parsers/hardware-inventory";

const fileId = process.argv[2];
const step = process.argv[3] ?? "stops";

async function main() {
  if (!fileId) {
    throw new Error(
      "Usage: pnpm tsx scripts/reprocess-import.ts <fileId> [stops|lines|all]",
    );
  }

  const file = await prisma.importFile.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new Error(`ImportFile not found: ${fileId}`);
  }

  const baseArgs = {
    fileId: file.id,
    storedPath: file.storedPath,
    originalFilename: file.originalFilename,
  };

  console.log(
    `Reprocessing ${file.importType} file "${file.originalFilename}"` +
      (file.importType === "GTFS_STATIC" ? ` (step=${step})…` : "…"),
  );

  async function runStep(
    label: string,
    parser: (args: typeof baseArgs & { runId: string }) => Promise<void>,
  ): Promise<void> {
    const run = await prisma.importRun.create({
      data: { fileId: baseArgs.fileId, status: "PROCESSING" },
    });
    console.log(`  • ${label} run ${run.id}`);
    try {
      await parser({ runId: run.id, ...baseArgs });
    } finally {
      const finalRun = await prisma.importRun.findUnique({
        where: { id: run.id },
      });
      console.log("    ", {
        status: finalRun?.status,
        rowsTotal: finalRun?.rowsTotal,
        rowsAccepted: finalRun?.rowsAccepted,
        rowsRejected: finalRun?.rowsRejected,
        summary: finalRun?.summary,
      });
    }
  }

  if (file.importType === "HARDWARE_INVENTORY") {
    await runStep("hardware-inventory", runHardwareInventoryImport);
    return;
  }

  if (file.importType === "GTFS_STATIC") {
    if (step !== "stops" && step !== "lines" && step !== "all") {
      throw new Error(`Unknown step "${step}". Use stops | lines | all.`);
    }
    if (step === "stops" || step === "all") {
      await runStep("gtfs-stops", runGtfsImport);
    }
    if (step === "lines" || step === "all") {
      await runStep("gtfs-lines", runGtfsLinesImport);
    }
    return;
  }

  throw new Error(`No parser wired for importType=${file.importType}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
