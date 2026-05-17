"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MaplibreMap,
  MapMouseEvent,
} from "maplibre-gl";

type Props = {
  styleUrl: string;
  attribution: string;
};

const ZURICH_CENTER: [number, number] = [8.541, 47.376];
const DEFAULT_ZOOM = 12;

// Hardware-Klassen → Farben (passt zu den Status-Badges anderswo).
const HW_COLORS: Record<string, string> = {
  A_REUSE_DFI_STANDALONE: "#14532d",
  B_REUSE_DFI_POLE: "#075985",
  C_REUSE_TICKET_MACHINE: "#6b21a8",
  D_REUSE_SHELTER: "#b45309",
  E_POWER_AVAILABLE_NEW_MOUNT: "#92400e",
  F_NO_HARDWARE: "#991b1b",
  G_UNKNOWN: "#475569",
  NONE: "#94a3b8",
};

const POI_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#f59e0b",
  LOW: "#84cc16",
};

const COLORBY: "hardwareClass" | "confidence" = "hardwareClass";

export default function MapView({ styleUrl, attribution }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [poisVisible, setPoisVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !ref.current) return;

      const map = new maplibre.Map({
        container: ref.current,
        style: styleUrl,
        center: ZURICH_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: { customAttribution: attribution },
      });
      mapRef.current = map;

      map.addControl(new maplibre.NavigationControl(), "top-left");

      map.on("load", () => {
        if (cancelled) return;

        map.addSource("sites", {
          type: "geojson",
          data: "/api/map/sites",
        });

        map.addLayer({
          id: "sites-circles",
          type: "circle",
          source: "sites",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              2,
              14,
              5,
              17,
              8,
            ] as unknown as ExpressionSpecification,
            "circle-color": [
              "match",
              ["get", COLORBY === "hardwareClass" ? "hardwareClass" : "hardwareClass"],
              ...Object.entries(HW_COLORS).flatMap(([k, v]) => [k, v]),
              /* default */ "#94a3b8",
            ] as unknown as ExpressionSpecification,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "confidence"], 0],
              0,
              0.35,
              1,
              0.95,
            ] as unknown as ExpressionSpecification,
            "circle-stroke-width": 0.5,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addSource("pois", {
          type: "geojson",
          data: "/api/map/pois",
        });

        map.addLayer({
          id: "pois-circles",
          type: "circle",
          source: "pois",
          paint: {
            "circle-radius": 9,
            "circle-color": [
              "match",
              ["get", "relevance"],
              ...Object.entries(POI_COLORS).flatMap(([k, v]) => [k, v]),
              "#f59e0b",
            ] as unknown as ExpressionSpecification,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.9,
          },
        });

        map.on("click", "sites-circles", (e) => {
          showSitePopup(maplibre, map, e);
        });
        map.on("click", "pois-circles", (e) => {
          showPoiPopup(maplibre, map, e);
        });
        map.on("mouseenter", "sites-circles", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "sites-circles", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseenter", "pois-circles", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "pois-circles", () => {
          map.getCanvas().style.cursor = "";
        });

        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [styleUrl, attribution]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const visibility = poisVisible ? "visible" : "none";
    if (map.getLayer("pois-circles")) {
      map.setLayoutProperty("pois-circles", "visibility", visibility);
    }
  }, [poisVisible, ready]);

  return (
    <>
      <div className="map-toolbar">
        <label className="toolbar-toggle">
          <input
            type="checkbox"
            checked={poisVisible}
            onChange={(e) => setPoisVisible(e.target.checked)}
          />
          POIs anzeigen
        </label>
        <MapLegend />
      </div>
      <div ref={ref} className="map-canvas" />
    </>
  );
}

function MapLegend() {
  return (
    <div className="map-legend">
      <strong>Sites (Hardware-Klasse)</strong>
      <ul>
        {Object.entries(HW_COLORS).map(([cls, color]) => (
          <li key={cls}>
            <span
              className="legend-swatch"
              style={{ backgroundColor: color }}
            />
            <code>{cls}</code>
          </li>
        ))}
      </ul>
      <strong>POIs (Relevanz)</strong>
      <ul>
        {Object.entries(POI_COLORS).map(([rel, color]) => (
          <li key={rel}>
            <span
              className="legend-swatch"
              style={{ backgroundColor: color }}
            />
            {rel}
          </li>
        ))}
      </ul>
      <small className="muted">
        Opazität pro Site ∝ Confidence
      </small>
    </div>
  );
}

function showSitePopup(
  maplibre: typeof import("maplibre-gl"),
  map: MaplibreMap,
  e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
) {
  const f = e.features?.[0];
  if (!f || f.geometry.type !== "Point") return;
  const p = f.properties as Record<string, unknown>;
  const id = String(p.id);
  const name = escapeHtml(String(p.name ?? "—"));
  const hw = String(p.hardwareClass ?? "NONE");
  const size = p.elementSize ? String(p.elementSize) : "—";
  const count = p.elementCount != null ? String(p.elementCount) : "—";
  const conf =
    typeof p.confidence === "number" ? p.confidence.toFixed(2) : "—";
  const operatorArea = String(p.operatorArea ?? "—");

  const html = `
    <div class="map-popup">
      <strong>${name}</strong>
      <div><code>${operatorArea}</code></div>
      <div>${size} · ${count} × · <code>${hw}</code></div>
      <div>Confidence: ${conf}</div>
      <a href="/sites/${encodeURIComponent(id)}">Detail öffnen →</a>
    </div>
  `;

  new maplibre.Popup({ closeButton: true, closeOnClick: true })
    .setLngLat(f.geometry.coordinates as [number, number])
    .setHTML(html)
    .addTo(map);
}

function showPoiPopup(
  maplibre: typeof import("maplibre-gl"),
  map: MaplibreMap,
  e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
) {
  const f = e.features?.[0];
  if (!f || f.geometry.type !== "Point") return;
  const p = f.properties as Record<string, unknown>;
  const name = escapeHtml(String(p.name ?? "—"));
  const category = p.category ? escapeHtml(String(p.category)) : "—";
  const relevance = String(p.relevance ?? "MEDIUM");
  const address = p.address ? escapeHtml(String(p.address)) : null;

  const html = `
    <div class="map-popup">
      <strong>${name}</strong>
      <div><code>${category}</code> · <code>${relevance}</code></div>
      ${address ? `<div>${address}</div>` : ""}
    </div>
  `;

  new maplibre.Popup({ closeButton: true, closeOnClick: true })
    .setLngLat(f.geometry.coordinates as [number, number])
    .setHTML(html)
    .addTo(map);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Reference the GeoJSONSource type to keep tree-shaking honest.
export type { GeoJSONSource };
