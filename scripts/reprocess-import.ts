/**
 * One-shot reprocess of an already-uploaded ImportFile.
 *
 *   pnpm tsx scripts/reprocess-import.ts <fileId>
 *
 * Creates a new ImportRun and runs the parser for the file's importType.
 * Useful when a parser was added after the file was uploaded, or when a
 * previous run failed.
 */
import { prisma } from "../src/lib/db";
import { runGtfsImport } from "../src/features/imports/parsers/gtfs";
import { runHardwareInventoryImport } from "../src/features/imports/parsers/hardware-inventory";

const fileId = process.argv[2];
if (!fileId) {
  console.error("Usage: pnpm tsx scripts/reprocess-import.ts <fileId>");
  process.exit(1);
}

async function main() {
  const file = await prisma.importFile.findUnique({ where: { id: fileId } });
  if (!file) {
    console.error(`ImportFile not found: ${fileId}`);
    process.exit(1);
  }

  const run = await prisma.importRun.create({
    data: { fileId: file.id, status: "PROCESSING" },
  });

  const args = {
    runId: run.id,
    fileId: file.id,
    storedPath: file.storedPath,
    originalFilename: file.originalFilename,
  };

  console.log(
    `Reprocessing ${file.importType} file "${file.originalFilename}" (run ${run.id})…`,
  );

  switch (file.importType) {
    case "GTFS_STATIC":
      await runGtfsImport(args);
      break;
    case "HARDWARE_INVENTORY":
      await runHardwareInventoryImport(args);
      break;
    default:
      console.error(`No parser wired for importType=${file.importType}`);
      process.exit(1);
  }

  const finalRun = await prisma.importRun.findUnique({ where: { id: run.id } });
  console.log("Done.", {
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
