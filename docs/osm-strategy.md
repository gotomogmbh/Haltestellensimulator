# OSM Strategy — Haltestellensimulator

Wie wir OpenStreetMap im Haltestellensimulator nutzen — und wie **nicht**.

## Warum OSM (Architekturentscheidung)

- **Keine Lizenzkosten** wie bei Google Maps / Mapbox.
- **Datenhoheit** — wir können Tiles selbst hosten, falls nötig.
- **Konsistenz** mit ÖV-Umfeld (viele ÖV-Tools setzen auf OSM).
- **Offene Daten** — Haltestellen, Strassen, POIs sind in OSM strukturiert vorhanden.

Architekturentscheidung: **Kein Google Maps, kein Mapbox als Kernabhängigkeit.** Eine spätere kostenpflichtige Tile-Quelle (z. B. Stadia, MapTiler) ist möglich, aber nur als Tile-Provider — die Daten bleiben OSM.

---

## Drei Nutzungsfälle

### 1. Karten-Hintergrund — MVP

- **Tile-Quelle**: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (Default, dev).
- **Attribution Pflicht**: `© OpenStreetMap contributors` in der UI sichtbar.
- **Library**: Leaflet oder MapLibre GL — Entscheidung in `mvp-roadmap.md` Phase 4.
- **Caveat**: Die offiziellen OSM-Tiles sind **nicht für Produktion mit hohem Traffic** zugelassen ([Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)). Vor Produktiv-Rollout entweder:
  - eigene Tile-Server-Instanz (osm.org-Stack oder vector tiles via Tileserver-GL), oder
  - kostenpflichtiger Tile-Provider auf OSM-Basis.

### 2. Geocoding (Adresse → Koordinaten) — Backlog, optional

- **Service**: Nominatim (offizielle Instanz: `https://nominatim.openstreetmap.org`).
- **Nutzungsregel** ([Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)):
  - Max **1 Request pro Sekunde**.
  - **User-Agent-Header Pflicht** mit Kontakt (siehe `.env.example`).
  - **Kein Bulk-Geocoding** — bei mehr als wenigen Lookups eigene Nominatim-Instanz aufsetzen.
- **Im Haltestellensimulator**:
  - Nominatim wird **nur für manuell ausgelöste Einzel-Lookups** verwendet (z. B. POI mit Adresse aber ohne Koordinaten).
  - UI erlaubt **keine Bulk-Buttons** ("alle 500 POIs geocodieren").
  - Für Bulk-Vorbereitung: Daten offline mit eigener Nominatim-Instanz / Geocoder anreichern und als CSV/Excel mit `lat`/`lon` re-importieren.

### 3. POI-Vorschläge in Umgebung — Backlog, optional

- **Service**: Overpass API (`https://overpass-api.de/api/interpreter`).
- **Anwendungsfall**: "Welche relevanten POIs liegen im 300-m-Radius dieser Haltestelle, die noch nicht in unserer POI-Liste sind?"
- **Nutzungsregel**:
  - Pro Haltestelle einzeln, manuell ausgelöst.
  - Kein automatisches Crawlen aller Haltestellen.
  - Ergebnisse werden **vorgeschlagen**, nicht automatisch persistiert — Planer:in entscheidet.
- **Im MVP**: nicht enthalten. POIs kommen über Upload (siehe `import-pipeline.md`).

---

## Was wir **nicht** machen

- ❌ Kein automatisches Bulk-Geocoding über öffentliche OSM-Dienste.
- ❌ Keine Hintergrundjobs, die regelmässig Overpass-Queries ausführen.
- ❌ Keine Google-Maps-/Mapbox-Tiles als Default.
- ❌ Kein Auto-Vervollständigen mit Live-Nominatim-Calls bei jedem Tastendruck.

---

## Datenflüsse (Diagramm)

```
┌─────────────┐
│   Browser   │
│  (Karte)    │◄────── Tiles ──── tile.openstreetmap.org  (MVP)
└─────────────┘
        │
        │  (Einzelner manueller Klick)
        ▼
┌──────────────────────────────────────────────────────┐
│  App-Backend / Frontend-Service                      │
│                                                      │
│   Single-Lookup  ──► Nominatim (User-Agent gesetzt)  │
│   Single-Lookup  ──► Overpass                        │
│                                                      │
│   (Rate-Limit-Wrapper, max 1 req/s je Service)       │
└──────────────────────────────────────────────────────┘
```

---

## Pflicht-Anzeige (Attribution)

In der UI muss sichtbar sein:

- Karten-Footer / -Ecke: `© OpenStreetMap contributors` mit Link auf `https://www.openstreetmap.org/copyright`.
- Bei Nutzung von Nominatim-Ergebnissen: gleicher Hinweis in der Detailansicht.

---

## Migrationspfad (wenn OSM-Tiles nicht reichen)

Falls die offiziellen Tiles für Produktion gesperrt sind:

1. **MapTiler / Stadia / Thunderforest** als OSM-basierten Tile-Provider einbinden (kostenpflichtig, aber kein Lock-in — Daten bleiben OSM).
2. Alternativ: **eigene Tile-Instanz** (z. B. via Docker, mit regelmässigem OSM-Planet-Import). Aufwändiger, aber volle Kontrolle.
3. **Vector Tiles** (MapLibre + selbst gehostete `.pmtiles`) — best of both worlds, etwas mehr Setup.

Entscheidung erst, wenn echte Last-Zahlen vorliegen.
