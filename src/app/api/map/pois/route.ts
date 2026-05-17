import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RADIUS_METERS = 300;
const RING_SEGMENTS = 64;

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

  type GeoJSONFeature =
    | {
        type: "Feature";
        geometry: { type: "Point"; coordinates: [number, number] };
        properties: Record<string, unknown>;
      }
    | {
        type: "Feature";
        geometry: { type: "Polygon"; coordinates: [number, number][][] };
        properties: Record<string, unknown>;
      };

  const features: GeoJSONFeature[] = pois.flatMap((p) => [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      properties: {
        kind: "point",
        id: p.id,
        name: p.name,
        category: p.category,
        relevance: p.relevance,
        address: p.address,
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          circleRing(p.latitude, p.longitude, RADIUS_METERS, RING_SEGMENTS),
        ],
      },
      properties: {
        kind: "radius",
        id: p.id,
        name: p.name,
        relevance: p.relevance,
        radiusMeters: RADIUS_METERS,
      },
    },
  ]);

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "cache-control": "no-store" } },
  );
}

function circleRing(
  lat: number,
  lon: number,
  radiusMeters: number,
  segments: number,
): [number, number][] {
  // Equirectangular-Approximation: bei 300 m / 47°N reicht das auf wenige
  // Meter genau, deutlich schneller als geodätische Berechnung.
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusMeters / 111320;
  const dLon = radiusMeters / (111320 * Math.cos(latRad));
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    ring.push([
      lon + dLon * Math.cos(angle),
      lat + dLat * Math.sin(angle),
    ]);
  }
  return ring;
}
