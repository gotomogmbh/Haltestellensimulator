# Data Model — Haltestellensimulator

Detailliertes Datenmodell des MVP. **Source of Truth ist `prisma/schema.prisma`** — dieses Dokument beschreibt *was* modelliert wird und *warum*, nicht die exakte Prisma-Syntax.

Alle IDs sind CUIDs (Strings). Alle Timestamps ISO-8601 UTC. Alle Geokoordinaten WGS84 als `latitude` / `longitude` (Float). PostGIS-Extension ist in der DB aktiv (`extensions = [postgis]`); Geometry-Columns werden nachgezogen, sobald wir räumliche Indizes brauchen.

---

## Übersicht

```
Site ─┬─► BoardingPoint (n)
      ├─► SiteLineAssignment (n) ─► TransitLine
      ├─► SiteHardwareInventory (1)
      ├─► SitePoiRelation (n)    ─► PointOfInterest
      └─► Recommendation (n)     ─► ScoringRun

ImportFile ─► ImportRun (n) ─┬─► ImportError (n)
                              └─► ImportMapping (n)

ImportFile ─► SiteHardwareInventory  (sourceImportFile)
ImportFile ─► PointOfInterest        (sourceImportFile)
```

---

## Modelle

### `Site` — Haltestelle (logisches Objekt)

Eine VBZ-/ZVV-Haltestelle als planerische Einheit (z. B. "Zürich, Bellevue"). Hat sie mehrere Steige, hängen diese als `BoardingPoint` darunter.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (cuid) | PK |
| `name` | String | Anzeigename |
| `municipality` | String? | Gemeinde |
| `didokNumber` | String? unique | DiDok-Nummer (CH-Standard für ÖV-Haltestellen) |
| `operatorArea` | enum `OperatorArea` | `VBZ` / `ZVV` / `MIXED` / `UNKNOWN` |
| `latitude`, `longitude` | Float | WGS84-Zentrum |
| `notes` | String? | Freitext |
| `createdAt`, `updatedAt` | DateTime | |

Indexe: `operatorArea`, `name`.

**Scope-Hinweis**: MVP filtert auf `operatorArea = VBZ`. Andere Werte (ZVV/MIXED) sind im Modell vorgesehen, aber nicht im MVP-Funktionsumfang.

### `BoardingPoint` — Steig

Einzelner Steig / Bahnsteig einer Site. Trägt die GTFS-Verbindung.

| Feld | Typ | |
|---|---|---|
| `siteId` | FK → Site (Cascade) | |
| `name`, `direction` | String? | |
| `gtfsStopId` | String? unique | aus GTFS |
| `didokNumber` | String? | |
| `latitude`, `longitude` | Float | |

### `TransitLine` — Linie

Tram-/Buslinie (z. B. Tram 11, Bus 31).

| Feld | Typ | |
|---|---|---|
| `shortName` | String | "11", "31" |
| `longName` | String? | |
| `mode` | String? | tram / bus / sbahn |
| `agencyId` | String? | |
| `gtfsRouteId` | String? unique | |
| `color` | String? | |

### `SiteLineAssignment` — m:n Site ↔ Line

Welche Linien an welcher Site halten, inkl. Frequenz pro Site.

| Feld | Typ | |
|---|---|---|
| `siteId` | FK → Site | |
| `lineId` | FK → TransitLine | |
| `weekdayDepartures` | Int? | Werktagsdurchschnitt |
| `peakHourDepartures` | Int? | HVZ-Spitze pro Stunde |

Unique: `(siteId, lineId)`. Liefert dem Scoring die Frequenz pro Site (Summe über alle Linien).

### `SiteHardwareInventory` — Pflicht-Flags (1:1)

Die fünf Pflichtmerkmale + Notizen + Provenance.

| Feld | Typ | Werte |
|---|---|---|
| `siteId` | FK → Site (unique) | |
| `dfiStandfuss` | enum `YesNoUnknown` | `YES` / `NO` / `UNKNOWN` (Default `UNKNOWN`) |
| `dfiStrommast` | enum `YesNoUnknown` | |
| `ticketautomat` | enum `YesNoUnknown` | |
| `strom` | enum `YesNoUnknown` | |
| `wartehaus` | enum `YesNoUnknown` | |
| `notes` | String? | |
| `recordedAt` | DateTime? | Zeitpunkt der Erhebung |
| `sourceImportFileId` | FK → ImportFile? | Provenance |

Indexe auf allen fünf Flags → schnelle Filter in der Sites-Tabelle.

**Regel**: Fehlt ein Wert im Import → `UNKNOWN`. Niemals stillschweigend auf `NO` defaulten.

### `PointOfInterest` — POI / Event-Location

Eigenständige Entität, separat von Sites.

| Feld | Typ | |
|---|---|---|
| `name` | String | |
| `category` | String? | freier Klassifikator (z. B. "shopping", "event_venue", "school") |
| `relevance` | enum `PoiRelevance` | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` (Default `MEDIUM`) |
| `latitude`, `longitude` | Float | |
| `address` | String? | |
| `validFrom`, `validTo` | DateTime? | für Events |
| `sourceImportFileId` | FK → ImportFile? | |

### `SitePoiRelation` — m:n mit Distanz

Berechnete Zuordnung POI ↔ Site mit Distanz. Wird im Scoring-Run aktualisiert (Default-Radius 300 m).

| Feld | Typ | |
|---|---|---|
| `siteId`, `poiId` | FK | unique zusammen |
| `distanceMeters` | Float | |
| `computedAt` | DateTime | |

### `Recommendation` — Empfehlung

Historisiert (n pro Site). Jede Empfehlung gehört zu einem `ScoringRun`.

| Feld | Typ | Werte |
|---|---|---|
| `siteId` | FK → Site | |
| `scoringRunId` | FK → ScoringRun | |
| `elementSize` | enum `ElementSize` | `S` / `M` / `L` / `XL` / `XXL` |
| `elementCount` | Int | ≥ 0 |
| `hardwareClass` | enum `HardwareIntegrationClass` | `A_REUSE_DFI_STANDALONE` … `G_UNKNOWN` |
| `scoreBreakdown` | Json | `{ frequency, poiRelevance, infrastructure, ... }` |
| `reasoning` | String[] | menschlich lesbare Begründung |
| `confidence` | Float | 0..1 |
| `inputsSnapshot` | Json | Kopie der Inputs zur Reproduzierbarkeit |
| `ruleVersion` | String | z. B. `scoring@0.3.0` |
| `computedAt` | DateTime | |

Index: `(siteId, computedAt DESC)` für "neueste Empfehlung pro Site".

### `ScoringRun` — Lauf der Scoring-Engine

| Feld | Typ | |
|---|---|---|
| `ruleVersion` | String | |
| `startedAt`, `finishedAt` | DateTime | |
| `siteCount` | Int? | |
| `triggeredBy` | String? | |
| `parameters` | Json? | falls Default-Schwellwerte überschrieben |

---

## Import-Modelle

### `ImportFile` — physische Datei

| Feld | Typ | |
|---|---|---|
| `importType` | enum `ImportType` | |
| `originalFilename` | String | |
| `storedPath` | String | relativ zu `STORAGE_ROOT` |
| `mimeType` | String? | |
| `sizeBytes` | Int | |
| `contentHash` | String unique | SHA-256 → Idempotenz |
| `uploadedAt`, `uploadedBy` | | |

### `ImportRun` — ein Verarbeitungsversuch

Eine `ImportFile` kann mehrfach verarbeitet werden (Re-Import nach Fix).

| Feld | Typ | |
|---|---|---|
| `fileId` | FK → ImportFile | |
| `status` | enum `ImportStatus` | `UPLOADED` / `PROCESSING` / `COMPLETED` / `FAILED` / `NEEDS_REVIEW` |
| `startedAt`, `finishedAt` | | |
| `rowsTotal`, `rowsAccepted`, `rowsRejected` | Int? | |
| `summary` | Json? | freie Counters je Importtyp |

### `ImportError` — fehlerhafte Zeile

| Feld | Typ | |
|---|---|---|
| `runId` | FK → ImportRun | |
| `rowNumber` | Int? | |
| `field` | String? | |
| `reason` | String | |
| `rawValue` | String? | |

### `ImportMapping` — Spaltenmapping

Welche Quell-Spalte (z. B. `DFI Mast`) auf welches Zielfeld (`dfiStrommast`) gemappt wurde — pro Run.

| Feld | Typ | |
|---|---|---|
| `runId` | FK → ImportRun | unique zusammen mit `sourceColumn` |
| `sourceColumn` | String | |
| `targetField` | String | |
| `transform` | String? | optional |

---

## Enums

```ts
type YesNoUnknown             = "YES" | "NO" | "UNKNOWN";
type ElementSize              = "S" | "M" | "L" | "XL" | "XXL";
type HardwareIntegrationClass =
  | "A_REUSE_DFI_STANDALONE"
  | "B_REUSE_DFI_POLE"
  | "C_REUSE_TICKET_MACHINE"
  | "D_REUSE_SHELTER"
  | "E_POWER_AVAILABLE_NEW_MOUNT"
  | "F_NO_HARDWARE"
  | "G_UNKNOWN";
type ImportStatus = "UPLOADED" | "PROCESSING" | "COMPLETED" | "FAILED" | "NEEDS_REVIEW";
type ImportType   =
  | "GTFS_STATIC"
  | "HARDWARE_INVENTORY"
  | "POI_EVENT_LOCATIONS"
  | "PASSENGER_COUNTS"
  | "MANUAL_SITE_ATTRIBUTES"
  | "OTHER";
type OperatorArea = "VBZ" | "ZVV" | "MIXED" | "UNKNOWN";
type PoiRelevance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
```

---

## Persistenz

PostgreSQL 16 + PostGIS 3.x via Prisma (siehe `architecture.md`, `setup.md`).

- Original-Dateien bleiben unter `storage/uploads/<kind>/<contentHash>__<filename>`.
- Verarbeitete Daten landen in der DB.
- Zusätzlich Append-only File-Audit unter `storage/processed/import-log.jsonl` (siehe `import-pipeline.md`).
- Keine Cloud-Buckets im MVP — Storage-Adapter erlaubt späteren Wechsel auf Supabase Storage oder S3.

---

## Offene Fragen

- **Exakte Excel-Spaltennamen** von VBZ → werden über `ImportMapping` festgehalten, sobald Beispieldaten vorliegen.
- **OperatorArea-Ableitung** für Sites mit Linien von VBZ + ZVV-Drittbetrieben: ab welcher Mischung wird `MIXED` korrekt, wann bleibt `VBZ`?
- **PoiRelevance-Mapping**: Wer entscheidet `LOW`/`MEDIUM`/`HIGH`/`CRITICAL`? Default je Kategorie definieren.
- **DiDok-Vollständigkeit**: durchgängig vorhanden oder tolerantes Matching nötig?
- **POI ohne Koordinaten**: aktuell sind `latitude/longitude` non-nullable. Bei häufigen Adress-only Imports ggf. nullable machen.
