# Data Model — Haltestellensimulator

Stand: **Entwurf v0** — bitte vor Implementierung der Import-Pipeline mit ZVV/VBZ abgleichen.

Alle IDs sind Strings, alle Timestamps ISO-8601 UTC, alle Geokoordinaten WGS84.

---

## Übersicht

```
ImportBatch  ─┬─► Stop  ─┬─► StopAttributes (1:1)
              │          ├─► StopFrequency (1:1, aus GTFS abgeleitet)
              │          ├─► StopPoiContext (1:1, aggregiert)
              │          └─► Recommendation (1:n historisiert)
              ├─► PoiLocation (n)
              └─► ImportLog (1:1)
```

---

## Entitäten

### `Stop` — Haltestelle (kanonisch)

Eine Haltestelle im ZVV-/VBZ-Sinn. **Bahnhöfe der SBB werden nicht als eigene Entität geführt** (Bahnhofsname kann als String an einem Stop hängen, aber kein eigenes Objekt).

| Feld | Typ | Quelle | Beschreibung |
|---|---|---|---|
| `id` | string (UUID) | intern | Interner Primärschlüssel |
| `gtfs_stop_id` | string \| null | GTFS | `stop_id` aus GTFS (z. B. `8503000:0:1`) |
| `didok_number` | string \| null | Excel / GTFS | DiDok-Nummer (CH-Standard für ÖV-Haltestellen) |
| `name` | string | GTFS / Excel | Anzeigename (z. B. "Zürich, Bellevue") |
| `municipality` | string \| null | GTFS / Excel | Gemeinde |
| `lat`, `lon` | float | GTFS | WGS84 |
| `operator` | enum | abgeleitet | `ZVV` \| `VBZ` \| `OTHER` |
| `external_refs` | object | Excel | freie ID-Map auf andere Systeme |
| `created_at`, `updated_at` | timestamp | intern | |

Indexe: `gtfs_stop_id` unique, `didok_number` unique, räumlicher Index auf `(lat, lon)`.

### `StopAttributes` — Pflicht-Flags

1:1 mit `Stop`. Trägt die fünf Pflichtmerkmale.

| Feld | Typ | Werte |
|---|---|---|
| `stop_id` | FK → Stop.id | |
| `dfi_standfuss` | enum | `yes` \| `no` \| `unknown` |
| `dfi_strommast` | enum | `yes` \| `no` \| `unknown` |
| `ticketautomat` | enum | `yes` \| `no` \| `unknown` |
| `strom` | enum | `yes` \| `no` \| `unknown` |
| `wartehaus` | enum | `yes` \| `no` \| `unknown` |
| `source_file` | string | Excel-Dateiname / Hash |
| `source_row` | int \| null | Originalzeile in Excel |
| `last_imported_at` | timestamp | |
| `notes` | string \| null | Freitext aus Excel |

**Regel**: Fehlt ein Wert im Import → `unknown`. Niemals stillschweigend auf `no` defaulten.

### `StopFrequency` — abgeleitete Frequenz

1:1 mit `Stop`. Aus GTFS berechnet, nicht editierbar.

| Feld | Typ | Beschreibung |
|---|---|---|
| `stop_id` | FK → Stop.id | |
| `daily_departures` | int | Abfahrten pro Werktag |
| `peak_departures_per_hour` | int | HVZ-Spitze |
| `served_routes` | string[] | Linien-IDs, die hier halten |
| `mode_mix` | object | Anteil Tram / Bus / S-Bahn etc. |
| `computed_from_gtfs_version` | string | Quell-GTFS-Paket-Hash/-Datum |
| `computed_at` | timestamp | |

### `PoiLocation` — Point of Interest / Event-Location

Eigenständige Entität, **separat von Stops importiert**. Wird beim Scoring per Geo-Radius / Walkshed an Stops zugeordnet.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string (UUID) | |
| `name` | string | |
| `category` | enum | `shopping` \| `event_venue` \| `school` \| `hospital` \| `tourism` \| `office` \| `other` |
| `relevance_weight` | float | 0.0–1.0, optional aus Excel; sonst Default je Kategorie |
| `lat`, `lon` | float | WGS84 |
| `address` | string \| null | |
| `valid_from`, `valid_to` | date \| null | Für Events |
| `source_file` | string | |
| `created_at` | timestamp | |

### `StopPoiContext` — aggregierter POI-Kontext pro Stop

Berechnet, nicht direkt importiert.

| Feld | Typ | Beschreibung |
|---|---|---|
| `stop_id` | FK → Stop.id | |
| `poi_count_300m` | int | POIs im 300-m-Radius |
| `relevance_sum_300m` | float | Summe der `relevance_weight` im 300-m-Radius |
| `top_poi_categories` | string[] | Häufigste Kategorien im Umfeld |
| `computed_at` | timestamp | |

Radius (300 m) ist Default; konfigurierbar in `docs/scoring.md`.

### `Recommendation` — Empfehlung pro Stop

Historisiert (n pro Stop), damit Änderungen über die Zeit nachvollziehbar bleiben.

| Feld | Typ | Werte / Beschreibung |
|---|---|---|
| `id` | string (UUID) | |
| `stop_id` | FK → Stop.id | |
| `element_size` | enum | `S` \| `M` \| `L` \| `XL` \| `XXL` |
| `element_count` | int | ≥ 0 |
| `hardware_class` | enum | `A_REUSE_DFI_STANDALONE` \| `B_REUSE_DFI_POLE` \| `C_REUSE_TICKET_MACHINE` \| `D_REUSE_SHELTER` \| `E_POWER_AVAILABLE_NEW_MOUNT` \| `F_NO_HARDWARE` \| `G_UNKNOWN` |
| `score_breakdown` | object | `{ frequency: float, poi_relevance: float, infrastructure: float, ... }` |
| `reasoning` | string[] | Menschlich lesbare Begründungs-Bullets |
| `confidence` | float | 0.0–1.0 |
| `rule_version` | string | Version der Scoring-Regeln (z. B. `scoring@0.3.0`) |
| `computed_at` | timestamp | |
| `inputs_snapshot` | object | Kopie der zur Berechnung verwendeten Inputs (für Reproduzierbarkeit) |

### `ImportBatch` — Import-Vorgang

Repräsentiert einen einzelnen Upload-Vorgang (Excel, GTFS oder POI).

| Feld | Typ | |
|---|---|---|
| `id` | string (UUID) | |
| `kind` | enum | `excel_stops` \| `gtfs` \| `poi` |
| `source_filename` | string | |
| `source_hash` | string | SHA-256 der Originaldatei |
| `received_at` | timestamp | |
| `uploaded_by` | string \| null | User-Identifier (sobald Auth existiert) |
| `status` | enum | `received` \| `validating` \| `matched` \| `persisted` \| `failed` |

### `ImportLog` — Detail-Protokoll pro Import

1:1 mit `ImportBatch`. Pflicht (siehe `import-pipeline.md`).

| Feld | Typ | |
|---|---|---|
| `batch_id` | FK → ImportBatch.id | |
| `rows_total` | int | |
| `rows_accepted` | int | |
| `rows_rejected` | int | |
| `rejections` | object[] | `{ row, reason, raw }` |
| `stops_matched` | int | Nur bei `excel_stops` |
| `stops_unmatched` | int | Nur bei `excel_stops` |
| `duration_ms` | int | |
| `notes` | string[] | |

---

## Enums (zentral)

```ts
type YesNoUnknown = "yes" | "no" | "unknown";

type ElementSize = "S" | "M" | "L" | "XL" | "XXL";

type HardwareClass =
  | "A_REUSE_DFI_STANDALONE"
  | "B_REUSE_DFI_POLE"
  | "C_REUSE_TICKET_MACHINE"
  | "D_REUSE_SHELTER"
  | "E_POWER_AVAILABLE_NEW_MOUNT"
  | "F_NO_HARDWARE"
  | "G_UNKNOWN";

type Operator = "ZVV" | "VBZ" | "OTHER";
```

---

## Persistenz im MVP

- Lokale Dateien unter `storage/processed/`:
  - `stops.json` — kanonische Stops + Attribute
  - `frequencies.json` — abgeleitet aus GTFS
  - `pois.json`
  - `recommendations/<batch_id>.json` — historische Empfehlungs-Snapshots
  - `import-log.jsonl` — append-only Log
- **Keine DB im MVP**. SQLite oder DuckDB als Optionen für Phase 3+.

---

## Offene Fragen

- Welche **exakten Spaltennamen** liefert ZVV/VBZ im Excel? → muss vor Import-Pipeline-Implementierung geklärt sein.
- Wie wird der **Operator** (`ZVV` vs `VBZ`) abgeleitet — aus Linien-Zuordnung oder aus Excel-Feld?
- Wird **DiDok** durchgängig geliefert oder müssen wir tolerant gegen fehlende DiDoks sein?
