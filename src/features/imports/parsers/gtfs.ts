import AdmZip from "adm-zip";
import Papa from "papaparse";

import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

const SITE_INSERT_BATCH = 1000;

export type GtfsRunArgs = {
  runId: string;
  fileId: string;
  storedPath: string;
  originalFilename: string;
};

/**
 * MVP-Variante des GTFS-Imports:
 * - Liest **nur** stops.txt aus dem ZIP.
 * - Ignoriert stop_times.txt (1.7 GB im aktuellen FP2026-Paket), trips, calendar.
 *   Frequenzen + Linien folgen in einem zweiten Schritt mit Streaming.
 * - Filtert auf parent-Stops (location_type leer / 0 / 1, ohne parent_station)
 *   und legt diese als `Site` an. Platform-Level wird (vorerst) übersprungen.
 * - `operatorArea`: `VBZ` für "Zürich, *"-Stops, sonst `UNKNOWN`.
 * - `needsReview` = true für alles ausserhalb von Zürich, damit klar bleibt,
 *   dass die VBZ-Filterung nur eine grobe Heuristik ist.
 *
 * Idempotenz via `createMany({ skipDuplicates: true })` auf `sloid`.
 */
export async function runGtfsImport(args: GtfsRunArgs): Promise<void> {
  const { runId, storedPath } = args;

  await prisma.importRun.update({
    where: { id: runId },
    data: { status: "PROCESSING" },
  });

  try {
    const buffer = await getStorage().read(storedPath);
    const zip = new AdmZip(buffer);

    const stopsEntry = zip
      .getEntries()
      .find(
        (e) =>
          !e.entryName.startsWith("__MACOSX/") &&
          (e.entryName === "stops.txt" || e.entryName.endsWith("/stops.txt")),
      );

    if (!stopsEntry) {
      await failRun(runId, "missing_stops_txt");
      return;
    }

    const text = stopsEntry.getData().toString("utf-8");
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = parsed.data;
    let zurichCount = 0;
    let skippedPlatform = 0;
    let skippedNoCoords = 0;
    let skippedNoId = 0;

    type SiteCreate = {
      name: string;
      municipality: string | null;
      sloid: string;
      latitude: number | null;
      longitude: number | null;
      operatorArea: "VBZ" | "UNKNOWN";
      needsReview: boolean;
    };
    const toInsert: SiteCreate[] = [];

    for (const row of rows) {
      const stopId = row.stop_id?.trim();
      const stopName = row.stop_name?.trim();
      const parentStation = row.parent_station?.trim();
      const locationType = row.location_type?.trim();

      if (!stopId || !stopName) {
        skippedNoId++;
        continue;
      }
      // Skip platform/entrance/boarding-area rows (will become BoardingPoints later).
      if (parentStation || (locationType && locationType !== "1" && locationType !== "0")) {
        skippedPlatform++;
        continue;
      }

      const lat = row.stop_lat ? Number.parseFloat(row.stop_lat) : NaN;
      const lon = row.stop_lon ? Number.parseFloat(row.stop_lon) : NaN;
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
      if (!hasCoords) {
        skippedNoCoords++;
        // Still create the Site, but with null coords — we'll mark needsReview.
      }

      const isZurich = /^Zürich,/.test(stopName);
      if (isZurich) zurichCount++;

      const commaIdx = stopName.indexOf(",");
      const municipality = commaIdx > 0 ? stopName.slice(0, commaIdx).trim() : null;

      toInsert.push({
        name: stopName,
        municipality,
        sloid: stopId,
        latitude: hasCoords ? lat : null,
        longitude: hasCoords ? lon : null,
        operatorArea: isZurich ? "VBZ" : "UNKNOWN",
        needsReview: !isZurich || !hasCoords,
      });
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += SITE_INSERT_BATCH) {
      const batch = toInsert.slice(i, i + SITE_INSERT_BATCH);
      const result = await prisma.site.createMany({
        data: batch,
        skipDuplicates: true,
      });
      inserted += result.count;
    }

    const skipped = skippedPlatform + skippedNoId;

    await prisma.importRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        rowsTotal: rows.length,
        rowsAccepted: inserted,
        rowsRejected: skipped,
        summary: {
          parsedRows: rows.length,
          candidateSites: toInsert.length,
          inserted,
          skippedPlatform,
          skippedNoId,
          skippedNoCoords,
          zurichSites: zurichCount,
          parserScope: "stops_only_minimal",
          note: "Linien, Frequenzen und Steige folgen in einem zweiten GTFS-Importschritt (Streaming).",
        },
      },
    });
  } catch (err) {
    await failRun(runId, String(err).slice(0, 500));
    throw err;
  }
}

async function failRun(runId: string, error: string) {
  await prisma.importRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      summary: { error },
    },
  });
}
