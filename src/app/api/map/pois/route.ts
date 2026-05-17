import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pois = await prisma.pointOfInterest.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      relevance: true,
      latitude: true,
      longitude: true,
      address: true,
    },
  });

  const features = pois.map((p) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [p.longitude, p.latitude],
    },
    properties: {
      id: p.id,
      name: p.name,
      category: p.category,
      relevance: p.relevance,
      address: p.address,
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "cache-control": "no-store" } },
  );
}
