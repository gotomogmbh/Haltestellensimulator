/**
 * GTFS Step 2 — Linien + Frequenzen.
 *
 * Liest `routes.txt`, `calendar.txt`, `trips.txt` (alle in-Memory, klein bis
 * mittelgross) und streamt `stop_times.txt` (1.7 GB im FP2026-Paket) durch
 * einen CSV-Parser. Aggregiert pro (Site, Linie) die "weekday equivalent
 * departures" — eine über Mo-Fr durchschnittliche Tagesfrequenz, gewichtet
 * mit dem Anteil der Wochentage, an denen das jeweilige `service_id` aktiv
 * ist.
 *
 * Was NICHT passiert:
 * - Filter auf VBZ / Zürich: alle Routen werden importiert, Operator-Filterung
 *   passiert später (oder in der UI).
 * - calendar_dates.txt (222 MB) wird ignoriert; Ausnahmen für Feiertage o.Ä.
 *   würden den MVP-Score nur marginal verschieben.
 * - BoardingPoints werden nicht angelegt; die Frequenz wird auf die Parent-
 *   Site (= unsere Site.sloid) aggregiert.
 */
import AdmZip from "adm-zip";
import csv from "csv-parser";
import unzipper from "unzipper";

import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

const SITE_LINE_INSERT_BATCH = 2000;
const PEAK_HOURS = new Set(["07", "08", "17", "18"]);

type RouteRow = {
  route_id: string;
  agency_id?: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type?: string;
  route_color?: string;
};

type CalendarRow = {
  service_id: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
};

type TripRow = {
  route_id: string;
  service_id: string;
  trip_id: string;
};

type StopRow = {
  stop_id: string;
  parent_station?: string;
};

export type GtfsLinesRunArgs = {
  runId: string;
  fileId: string;
  storedPath: string;
  originalFilename: string;
};

export async function runGtfsLinesImport(args: GtfsLinesRunArgs): Promise<void> {
  const { runId, storedPath } = args;

  await prisma.importRun.update({
    where: { id: runId },
    data: { status: "PROCESSING" },
  });

  try {
    const absolutePath = getStorage().resolveAbsolutePath(storedPath);

    // ---------- Phase 1: small files in-memory via adm-zip ----------
    const zip = new AdmZip(absolutePath);

    const routes = readZipCsv<RouteRow>(zip, "routes.txt");
    const calendar = readZipCsv<CalendarRow>(zip, "calendar.txt");
    const trips = readZipCsv<TripRow>(zip, "trips.txt");
    const stops = readZipCsv<StopRow>(zip, "stops.txt");

    // ---------- Phase 2: derive helper maps ----------
    // service_id → fraction of Mo-Fr it runs (0..1, in steps of 0.2)
    const serviceWeekdayFactor = new Map<string, number>();
    for (const c of calendar) {
      const days = [c.monday, c.tuesday, c.wednesday, c.thursday, c.friday]
        .filter((d) => d === "1").length;
      if (days > 0) serviceWeekdayFactor.set(c.service_id, days / 5);
    }

    // trip_id → { routeId, factor } (only weekday-running trips kept)
    const tripInfo = new Map<string, { routeId: string; factor: number }>();
    let weekdayTripCount = 0;
    for (const t of trips) {
      const factor = serviceWeekdayFactor.get(t.service_id);
      if (factor && factor > 0) {
        tripInfo.set(t.trip_id, { routeId: t.route_id, factor });
        weekdayTripCount++;
      }
    }

    // stop_id → parent_station; for parent-less stops, map to themselves.
    const parentOf = new Map<string, string>();
    for (const s of stops) {
      const parent = s.parent_station?.trim();
      parentOf.set(s.stop_id, parent && parent.length > 0 ? parent : s.stop_id);
    }

    // ---------- Phase 3: stream stop_times.txt and aggregate ----------
    type Aggregate = { weekday: number; peak: number };
    // key: `${parentSloid}|${routeId}`
    const counts = new Map<string, Aggregate>();
    const routesSeen = new Set<string>();

    let stopTimesRows = 0;
    let matchedRows = 0;

    await streamStopTimes(absolutePath, (row) => {
      stopTimesRows++;
      const info = tripInfo.get(row.trip_id);
      if (!info) return;
      const parent = parentOf.get(row.stop_id) ?? row.stop_id;
      const key = `${parent}|${info.routeId}`;
      const existing = counts.get(key);
      const hour = (row.arrival_time ?? row.departure_time ?? "").slice(0, 2);
      const inPeak = PEAK_HOURS.has(hour);
      if (existing) {
        existing.weekday += info.factor;
        if (inPeak) existing.peak += info.factor;
      } else {
        counts.set(key, {
          weekday: info.factor,
          peak: inPeak ? info.factor : 0,
        });
      }
      routesSeen.add(info.routeId);
      matchedRows++;
    });

    // ---------- Phase 4: write TransitLine rows ----------
    const routeById = new Map<string, RouteRow>(
      routes.map((r) => [r.route_id, r] as [string, RouteRow]),
    );
    const seenRouteRows = [...routesSeen]
      .map((id) => routeById.get(id))
      .filter((r): r is RouteRow => Boolean(r));

    if (seenRouteRows.length > 0) {
      await prisma.transitLine.createMany({
        data: seenRouteRows.map((r) => ({
          shortName: r.route_short_name?.trim() || r.route_id,
          longName: r.route_long_name?.trim() || null,
          mode: gtfsModeFromRouteType(r.route_type),
          agencyId: r.agency_id?.trim() || null,
          gtfsRouteId: r.route_id,
          color: r.route_color?.trim() || null,
        })),
        skipDuplicates: true,
      });
    }

    // Lookup: route_id → TransitLine.id
    const lines = await prisma.transitLine.findMany({
      where: { gtfsRouteId: { in: [...routesSeen] } },
      select: { id: true, gtfsRouteId: true },
    });
    const lineIdByRoute = new Map<string, string>(
      lines
        .map((l) => [l.gtfsRouteId ?? "", l.id] as [string, string])
        .filter(([k]) => k.length > 0),
    );

    // ---------- Phase 5: write SiteLineAssignment rows ----------
    // We need siteId for each parent sloid we encountered.
    const parentSloids = [
      ...new Set([...counts.keys()].map((k) => k.split("|")[0]!)),
    ];

    // Look up Sites in chunks (Postgres `IN` clause limit is ~32k params).
    const siteIdBySloid = new Map<string, string>();
    const CHUNK = 5000;
    for (let i = 0; i < parentSloids.length; i += CHUNK) {
      const chunk = parentSloids.slice(i, i + CHUNK);
      const sites = await prisma.site.findMany({
        where: { sloid: { in: chunk } },
        select: { id: true, sloid: true },
      });
      for (const s of sites) {
        if (s.sloid) siteIdBySloid.set(s.sloid, s.id);
      }
    }

    type AssignmentInput = {
      siteId: string;
      lineId: string;
      weekdayDepartures: number;
      peakHourDepartures: number;
    };
    const assignments: AssignmentInput[] = [];
    let droppedNoSite = 0;
    let droppedNoLine = 0;

    for (const [key, agg] of counts) {
      const [sloid, routeId] = key.split("|");
      if (!sloid || !routeId) continue;
      const siteId = siteIdBySloid.get(sloid);
      const lineId = lineIdByRoute.get(routeId);
      if (!siteId) {
        droppedNoSite++;
        continue;
      }
      if (!lineId) {
        droppedNoLine++;
        continue;
      }
      assignments.push({
        siteId,
        lineId,
        weekdayDepartures: Math.round(agg.weekday),
        peakHourDepartures: Math.round(agg.peak),
      });
    }

    // Wipe existing assignments for the touched sites and reinsert — keeps
    // the table consistent with the latest import without juggling per-row
    // upserts in this volume. Both delete and create are chunked: Postgres'
    // prepared-statement bind-variable limit is 32 767, and Prisma needs
    // one per ID.
    if (assignments.length > 0) {
      const uniqueSiteIds = [...new Set(assignments.map((a) => a.siteId))];
      const DELETE_CHUNK = 10000;
      for (let i = 0; i < uniqueSiteIds.length; i += DELETE_CHUNK) {
        await prisma.siteLineAssignment.deleteMany({
          where: { siteId: { in: uniqueSiteIds.slice(i, i + DELETE_CHUNK) } },
        });
      }
      for (let i = 0; i < assignments.length; i += SITE_LINE_INSERT_BATCH) {
        const batch = assignments.slice(i, i + SITE_LINE_INSERT_BATCH);
        await prisma.siteLineAssignment.createMany({
          data: batch,
          skipDuplicates: true,
        });
      }
    }

    await prisma.importRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        rowsTotal: stopTimesRows,
        rowsAccepted: assignments.length,
        rowsRejected: droppedNoSite + droppedNoLine,
        summary: {
          parserScope: "lines_and_weekday_frequencies",
          routes: routes.length,
          weekdayTrips: weekdayTripCount,
          stopTimesRowsTotal: stopTimesRows,
          stopTimesRowsMatched: matchedRows,
          routesSeen: routesSeen.size,
          transitLinesUpserted: seenRouteRows.length,
          siteLineAssignmentsWritten: assignments.length,
          droppedAssignmentsNoSite: droppedNoSite,
          droppedAssignmentsNoLine: droppedNoLine,
          note: "Frequenzen sind Wochentag-Mittelwerte; calendar_dates.txt wird ignoriert.",
        },
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
// Helpers
// ============================================================

function readZipCsv<T>(zip: AdmZip, leaf: string): T[] {
  const entry = zip
    .getEntries()
    .find(
      (e) =>
        !e.entryName.startsWith("__MACOSX/") &&
        (e.entryName === leaf || e.entryName.endsWith("/" + leaf)),
    );
  if (!entry) throw new Error(`Missing ${leaf} in GTFS zip`);
  const text = entry.getData().toString("utf-8");
  // adm-zip is fine for these (largest is trips.txt ~200 MB; ok in 4 GB heap).
  // For stop_times we use a streaming path below.
  const rows = parseCsvSync<T>(text);
  return rows;
}

function parseCsvSync<T>(text: string): T[] {
  // Light-weight sync CSV reader (single-byte UTF-8 cells, no quoted newlines).
  // Good enough for routes/calendar/trips/stops from opentransportdata.swiss.
  // opentransportdata.swiss writes a UTF-8 BOM at the start of each CSV; strip
  // it so the first header isn't named "﻿service_id" etc.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!);
  const out: T[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length === 0) continue;
    const cells = splitCsvLine(line);
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]!] = cells[j] ?? "";
    }
    out.push(obj as T);
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  // RFC 4180-ish: handles quoted cells with embedded commas.
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    let cell = "";
    if (line[i] === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          cell += line[i++];
        }
      }
    } else {
      while (i < line.length && line[i] !== ",") cell += line[i++];
    }
    result.push(cell);
    if (line[i] === ",") i++;
  }
  if (line.endsWith(",")) result.push("");
  return result;
}

async function streamStopTimes(
  zipPath: string,
  onRow: (row: {
    trip_id: string;
    stop_id: string;
    arrival_time?: string;
    departure_time?: string;
  }) => void,
): Promise<void> {
  const directory = await unzipper.Open.file(zipPath);
  const stopTimes = directory.files.find(
    (f) => f.path.endsWith("/stop_times.txt") || f.path === "stop_times.txt",
  );
  if (!stopTimes) throw new Error("Missing stop_times.txt in GTFS zip");

  return new Promise((resolve, reject) => {
    const stream = stopTimes.stream();
    stream
      .pipe(
        csv({
          // strip the UTF-8 BOM the CH GTFS feed prepends — otherwise the
          // first header in stop_times is "﻿trip_id" and lookups miss.
          mapHeaders: ({ header }) => header.replace(/^﻿/, ""),
        }),
      )
      .on("data", (row) => onRow(row))
      .on("end", () => resolve())
      .on("error", reject);
    stream.on("error", reject);
  });
}

function gtfsModeFromRouteType(rt: string | undefined): string | null {
  if (!rt) return null;
  switch (rt.trim()) {
    case "0":
    case "900":
      return "tram";
    case "1":
    case "401":
    case "402":
      return "metro";
    case "2":
    case "100":
    case "101":
    case "102":
    case "103":
      return "rail";
    case "3":
    case "700":
    case "701":
    case "702":
    case "704":
    case "715":
      return "bus";
    case "4":
    case "1200":
      return "ferry";
    case "5":
    case "1300":
      return "aerial";
    case "6":
    case "1400":
      return "funicular";
    case "7":
      return "cablecar";
    default:
      return rt;
  }
}

