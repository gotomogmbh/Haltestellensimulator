# Import Pipeline — Haltestellensimulator

Definiert, wie externe Daten (**Excel**, **GTFS**, **POI/Event**) in die App gelangen, validiert, gematcht, persistiert und protokolliert werden.

## Grundprinzipien

1. **Jeder Import wird protokolliert** — kein Datenimport ohne `ImportBatch` + `ImportLog`.
2. **Original-Datei bleibt unveränderlich** unter `storage/uploads/<kind>/<hash>__<filename>`.
3. **Idempotenz** — gleicher Datei-Hash → kein Re-Import (oder explizites Re-Process mit neuem Batch).
4. **`unknown` ist gültig** — fehlende Werte werden nicht in `no` umgewandelt.
5. **Kein automatisches Bulk-Geocoding** über öffentliche OSM-Dienste. Geocoding nur als manueller Einzelfall.
6. **Validierung vor Persistenz** — ungültige Zeilen landen in `ImportLog.rejections[]`, nicht in der kanonischen Tabelle.

---

## Pipeline (drei Kanäle)

```
┌─────────────────────────────────────────────────────────────────┐
│  Upload (Excel | GTFS | POI)                                    │
│   └─► storage/uploads/<kind>/<hash>__<filename>                 │
│                                                                 │
│   ImportBatch.created (status=received)                         │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Validate (Schema + Pflichtfelder + Wertebereiche)              │
│   status=validating → rejections[] werden gesammelt             │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Normalize (Spaltennamen, Trim, Enum-Mapping, Geo-Format)       │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Match (nur bei excel_stops / poi)                              │
│   - excel_stops → gegen Stop (GTFS) via DiDok / Name+Geo        │
│   - poi → räumlich auf Stops im Radius zuordnen (im Scoring)    │
│   status=matched                                                │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Persist → storage/processed/<entity>.json                      │
│   status=persisted                                              │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Log → storage/processed/import-log.jsonl (append-only)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Kanal 1 — Excel (Bestandsdaten zu Haltestellen)

### Erwartete Spalten (Entwurf — final mit ZVV/VBZ abstimmen)

| Pflicht | Spalte (akzeptierte Varianten) | Ziel-Feld |
|---|---|---|
| ✔ | `didok` / `didok_nr` / `didok_number` | `Stop.didok_number` |
| ✔ | `name` / `haltestelle` | `Stop.name` |
| (optional) | `lat`, `lon` | `Stop.lat/lon` (Fallback, wenn GTFS-Match scheitert) |
| ✔ | `dfi_standfuss` (Werte: ja/nein/unbekannt, yes/no/unknown, 1/0/-) | `StopAttributes.dfi_standfuss` |
| ✔ | `dfi_strommast` | `StopAttributes.dfi_strommast` |
| ✔ | `ticketautomat` | `StopAttributes.ticketautomat` |
| ✔ | `strom` | `StopAttributes.strom` |
| ✔ | `wartehaus` | `StopAttributes.wartehaus` |
| (optional) | `notes` / `bemerkung` | `StopAttributes.notes` |

### Enum-Normalisierung

```
"ja", "yes", "1", "true", "y"          → "yes"
"nein", "no", "0", "false", "n"        → "no"
"", "?", "unbekannt", "unknown", "n/a" → "unknown"
```

Unbekannte Werte → Zeile in `rejections[]` mit Grund `"value_not_mappable"`.

### Matching gegen GTFS

Reihenfolge der Strategien (erste passende gewinnt):

1. **DiDok-Match** — `Stop.didok_number == Excel.didok`.
2. **Name + Geo-Match** — exakter Name UND Distanz < 50 m.
3. **Fuzzy-Name + Geo** — Levenshtein < 3 UND Distanz < 100 m.
4. **Geo-only** — Distanz < 30 m (nur wenn genau eine Kandidat-Haltestelle in Reichweite).

Erfolglose Matches: in `ImportLog.stops_unmatched` zählen, Zeile mit Grund `"no_gtfs_match"` in `rejections[]` (Datensatz wird trotzdem persistiert — siehe Regel unten).

**Regel**: Auch unmatched Excel-Zeilen werden persistiert (als `Stop` ohne `gtfs_stop_id`), damit die Planer:innen sie manuell zuordnen können. Sie erscheinen mit Confidence-Abzug und einem Flag `needs_manual_match`.

---

## Kanal 2 — GTFS (opentransportdata.swiss)

### Quelle

- ZIP-Paket gemäss GTFS-Spec (`stops.txt`, `stop_times.txt`, `trips.txt`, `routes.txt`, `calendar.txt`, …).
- Pfad: `storage/uploads/gtfs/<hash>__<filename>.zip`.
- URL der aktuellen Version in `.env` (`GTFS_SOURCE_URL`).

### Verarbeitung

1. ZIP entpacken in temporären Pfad.
2. **Stops einlesen** → kanonische `Stop`-Tabelle (mit `gtfs_stop_id`, `didok_number` falls in `stops.txt` mitgeliefert, `lat`, `lon`, `name`).
3. **Frequenzen berechnen** → `StopFrequency`:
   - Werktagsdurchschnitt aus `calendar.txt` + `stop_times.txt`.
   - HVZ: 07:00–09:00 und 17:00–19:00.
4. **Operator-Ableitung** — aus `agency_id` / Linienzuordnung: ZVV/VBZ-Linien identifizieren.

### Wichtiges

- GTFS-Updates erscheinen wöchentlich auf opentransportdata.swiss. Jeder neue Import erzeugt einen neuen `ImportBatch`.
- Alte `StopFrequency`-Berechnungen bleiben erhalten (für historische Vergleiche), neueste wird als "aktuell" markiert.
- **Kein Bulk-Geocoding nötig** — GTFS liefert die Koordinaten direkt.

---

## Kanal 3 — POI / Event-Locations

### Format

Excel/CSV mit mindestens:

| Pflicht | Spalte | Ziel-Feld |
|---|---|---|
| ✔ | `name` | `PoiLocation.name` |
| ✔ | `category` | `PoiLocation.category` (Enum, siehe `data-model.md`) |
| ✔ | `lat`, `lon` **oder** `address` | siehe unten |
| (optional) | `relevance_weight` (0.0–1.0) | `PoiLocation.relevance_weight` |
| (optional) | `valid_from`, `valid_to` | für Events |

### Geocoding-Regel

- Wenn `lat`/`lon` vorhanden → **direkt verwenden**.
- Wenn nur `address` → **kein automatisches Bulk-Geocoding**. Stattdessen:
  - Adresse landet zunächst ohne Koordinaten in `PoiLocation`, Status `needs_geocoding`.
  - UI bietet "Geocode now"-Button pro Zeile, der **einen einzelnen** Nominatim-Lookup macht (mit User-Agent-Header gemäss Usage-Policy).
  - Bulk-Lookups (≥ 10) werden vom UI abgelehnt; in dem Fall: Adressen offline mit einer eigenen Nominatim-Instanz / Geocoding-Tool vorbereiten und mit `lat/lon` re-importieren.

### POI → Stop-Zuordnung

POIs werden **nicht** beim Import an einen Stop "gehängt". Die Zuordnung erfolgt im Scoring per räumlichem Query (Default-Radius 300 m). So bleibt der POI-Datenbestand unabhängig editierbar.

---

## ImportLog — Pflichtinhalt pro Batch

```json
{
  "batch_id": "uuid",
  "kind": "excel_stops",
  "source_filename": "zvv-bestand-2026-05.xlsx",
  "source_hash": "sha256:...",
  "received_at": "2026-05-16T10:12:33Z",
  "duration_ms": 1843,
  "rows_total": 412,
  "rows_accepted": 401,
  "rows_rejected": 11,
  "stops_matched": 388,
  "stops_unmatched": 13,
  "rejections": [
    { "row": 14, "reason": "value_not_mappable", "raw": { "strom": "vielleicht" } },
    { "row": 87, "reason": "missing_required_field:didok_or_name", "raw": { ... } }
  ],
  "notes": ["GTFS-Version 2026-05-12 verwendet"]
}
```

Append-only Datei: `storage/processed/import-log.jsonl` — ein JSON-Objekt pro Zeile.

---

## Fehlerbehandlung

| Fehlerart | Verhalten |
|---|---|
| Datei nicht lesbar / falsches Format | Batch.status=`failed`, kein Persist, vollständige Diagnose ins Log |
| Schema-Mismatch (Pflichtspalten fehlen) | Batch.status=`failed`, Log enthält fehlende Spalten |
| Einzelne Zeilen ungültig | Zeile in `rejections[]`, Rest wird verarbeitet |
| Match-Konflikte (ein Excel-Eintrag → mehrere GTFS-Stops) | Beide Kandidaten ins Log; Status `needs_manual_match`; Empfehlung wird trotzdem berechnet, mit Confidence-Abzug |
| Hash bereits importiert | Skip mit Hinweis; Re-Process nur per explizitem Flag |
