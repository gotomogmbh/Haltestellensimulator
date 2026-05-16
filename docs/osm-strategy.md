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

- **Library**: **MapLibre GL** (Entscheidung dokumentiert in `architecture.md`).
- **Tile-Quelle**: **OpenFreeMap** Vector Tiles, OSM-basiert, kostenfrei, kein API-Key — `MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty` in `.env`.
- **Attribution Pflicht**: `© OpenStreetMap contributors, © OpenFreeMap` persistent in der Map-Komponente.
- **Migrationspfad** (falls OpenFreeMap nicht reicht): MapTiler (kostenpflichtig) oder selbst gehostete `pmtiles`. Beides bleibt MapLibre-kompatibel — kein Library-Wechsel nötig.
- **Hinweis**: Raster-Tiles von `tile.openstreetmap.org` werden nicht verwendet (Tile Usage Policy umgangen). Falls für Spezialfälle nötig, ginge das mit MapLibre + Raster-Source.

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
│  (MapLibre) │◄────── Vector Tiles ──── tiles.openfreemap.org  (MVP)
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

## Migrationspfad (wenn OpenFreeMap nicht reicht)

OpenFreeMap garantiert keinen kommerziellen SLA. Falls in Produktion mehr Stabilität / Last nötig wird:

1. **MapTiler** als OSM-basierten Vector-Tile-Provider (kostenpflichtig, kein Lock-in — Style bleibt MapLibre-kompatibel).
2. **Selbst gehostete `pmtiles`** — Datei wird einmal aus OSM gebaut, statisch ausgeliefert. Best of both worlds, etwas mehr Setup.
3. **Eigene Tileserver-GL-Instanz** mit regelmässigem OSM-Planet-Import — volle Kontrolle, höchster Aufwand.

In jedem Fall bleibt **MapLibre GL als Library** — kein Frontend-Refactor nötig. Entscheidung erst, wenn echte Last-Zahlen vorliegen.
