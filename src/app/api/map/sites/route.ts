import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type RawRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  operatorArea: string;
  needsReview: boolean;
  hardwareClass: string | null;
  confidence: number | null;
  elementSize: string | null;
  elementCount: number | null;
};

export async function GET() {
  // LATERAL join to pull only the latest Recommendation per Site without an
  // n+1. ::int4 casts keep ints out of BigInt territory in $queryRaw.
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      s.id,
      s.name,
      s.latitude,
      s.longitude,
      s."operatorArea",
      s."needsReview",
      r."hardwareClass",
      r.confidence,
      r."elementSize",
      r."elementCount"::int4 AS "elementCount"
    FROM "Site" s
    LEFT JOIN LATERAL (
      SELECT
        "hardwareClass",
        confidence,
        "elementSize",
        "elementCount"
      FROM "Recommendation"
      WHERE "siteId" = s.id
      ORDER BY "computedAt" DESC
      LIMIT 1
    ) r ON true
    WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL;
  `;

  const features = rows.map((r) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [r.longitude, r.latitude],
    },
    properties: {
      id: r.id,
      name: r.name,
      operatorArea: r.operatorArea,
      needsReview: r.needsReview,
      hardwareClass: r.hardwareClass ?? "NONE",
      confidence: r.confidence ?? 0,
      elementSize: r.elementSize,
      elementCount: r.elementCount,
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "cache-control": "no-store" } },
  );
}
