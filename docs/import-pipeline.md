# Import Pipeline — Haltestellensimulator

Definiert, wie externe Daten (**Hardware-Inventar Excel**, **GTFS**, **POI/Event**) in die App gelangen, validiert, gematcht, persistiert und protokolliert werden.

Modell-Begriffe (`Site`, `ImportFile`, `ImportRun`, `ImportError`, `ImportMapping`) sind in `data-model.md` definiert.

## Grundprinzipien

1. **Jeder Import wird protokolliert** — kein Datenimport ohne `ImportFile` + zugehörigem `ImportRun`.
2. **Original-Datei bleibt unveränderlich** unter `storage/uploads/<kind>/<contentHash>__<originalFilename>`.
3. **Idempotenz** via `ImportFile.contentHash` (SHA-256, unique). Gleicher Hash → kein neuer `ImportFile`; Re-Process über neuen `ImportRun`.
4. **`UNKNOWN` ist gültig** — fehlende Werte werden nicht in `NO` umgewandelt.
5. **Kein automatisches Bulk-Geocoding** über öffentliche OSM-Dienste. Geocoding nur als manuell ausgelöster Einzelfall.
6. **Validierung vor Persistenz** — ungültige Zeilen landen als `ImportError`-Records, nicht in den Ziel-Tabellen.

---

## Pipeline (drei Kanäle)

```
┌─────────────────────────────────────────────────────────────────┐
│  Upload (HARDWARE_INVENTORY | GTFS_STATIC | POI_EVENT_LOCATIONS)│
│   └─► storage/uploads/<kind>/<hash>__<filename>                 │
│                                                                 │
│   ImportFile.create  +  ImportRun.create (status=UPLOADED)      │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Validate (Schema + Pflichtfelder + Wertebereiche)              │
│   status=PROCESSING                                             │
│   ImportError-Records werden gesammelt                          │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Map & Normalize                                                │
│   ImportMapping-Records pro Quell→Ziel-Spalte                   │
│   Enum-Normalisierung (ja/yes/1 → YES)                          │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Match (nur HARDWARE_INVENTORY / POI)                           │
│   - HARDWARE_INVENTORY → gegen Site via DiDok / Name+Geo        │
│   - POI → räumliche Zuordnung zu Sites erst im Scoring-Run      │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Persist → Ziel-Tabellen (Site, SiteHardwareInventory, …)       │
│   status = COMPLETED | NEEDS_REVIEW                             │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Log → File-Audit storage/processed/import-log.jsonl            │
│   (zusätzlich zur DB)                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Kanal 1 — Excel: Hardware-Inventar

`ImportType = HARDWARE_INVENTORY`. Verarbeitung **synchron im API-Request** (kleine Files, ≤ ~5 MB).

### Erwartete Spalten (Entwurf — final mit VBZ abstimmen)

| Pflicht | Quell-Spalte (akzeptierte Varianten) | Ziel-Feld |
|---|---|---|
| ✔ | `didok` / `didok_nr` / `didokNumber` | `Site.didokNumber` (Match-Schlüssel) |
| ✔ | `name` / `haltestelle` | `Site.name` |
| (optional) | `lat`, `lon` | `Site.latitude` / `longitude` (Fallback bei fehlendem GTFS-Match) |
| ✔ | `dfi_standfuss` | `SiteHardwareInventory.dfiStandfuss` |
| ✔ | `dfi_strommast` | `SiteHardwareInventory.dfiStrommast` |
| ✔ | `ticketautomat` | `SiteHardwareInventory.ticketautomat` |
| ✔ | `strom` | `SiteHardwareInventory.strom` |
| ✔ | `wartehaus` | `SiteHardwareInventory.wartehaus` |
| (optional) | `notes` / `bemerkung` | `SiteHardwareInventory.notes` |

Jede Mapping-Entscheidung landet als `ImportMapping`-Record am `ImportRun`.

### Enum-Normalisierung (`YesNoUnknown`)

```
"ja", "yes", "1", "true", "y"          → "YES"
"nein", "no", "0", "false", "n"        → "NO"
"", "?", "unbekannt", "unknown", "n/a" → "UNKNOWN"
```

Unbekannte Eingabe → `ImportError` mit `reason = "value_not_mappable"`.

### Matching gegen Site / BoardingPoint

Reihenfolge (erste passende gewinnt):

1. **DiDok-Match** — `Site.didokNumber == Excel.didok`.
2. **Name + Geo-Match** — exakter Name UND Distanz < 50 m zu einem `BoardingPoint` oder `Site`.
3. **Fuzzy-Name + Geo** — Levenshtein < 3 UND Distanz < 100 m.
4. **Geo-only** — Distanz < 30 m (nur wenn genau ein Kandidat in Reichweite).

Erfolgloses Matching:
- `ImportError` mit `reason = "no_site_match"`.
- `ImportRun.status = NEEDS_REVIEW`.
- Datensatz wird trotzdem persistiert (neue `Site` mit `operatorArea = UNKNOWN`), damit die Planer:innen manuell zuordnen können.

---

## Kanal 2 — GTFS (opentransportdata.swiss)

`ImportType = GTFS_STATIC`. **Verarbeitung als CLI**: `pnpm gtfs:import <zip>`. Datei ist gross (50–200 MB) und Verarbeitung dauert Minuten → gehört nicht in einen HTTP-Request.

### Quelle

- ZIP-Paket gemäss GTFS-Spec (`stops.txt`, `stop_times.txt`, `trips.txt`, `routes.txt`, `calendar.txt`, …).
- Abgelegt unter `storage/uploads/gtfs/<contentHash>__<filename>.zip`.
- URL der aktuellen Version in `.env` (`GTFS_SOURCE_URL`).

### Verarbeitung

1. ZIP entpacken in temporären Pfad.
2. **Stops → `BoardingPoint` + `Site`** — pro GTFS-Stop entsteht ein `BoardingPoint` mit `gtfsStopId` und Koordinaten; `Site` als Aggregat (gleiche `parent_station` oder gleicher Name).
3. **Routen → `TransitLine`** aus `routes.txt`.
4. **Frequenzen → `SiteLineAssignment`** — `weekdayDepartures` aus `calendar.txt` + `stop_times.txt`. HVZ-Spitze (07–09, 17–19) als `peakHourDepartures`.
5. **`OperatorArea`-Ableitung** — `VBZ` für VBZ-Agency-IDs, `ZVV` für andere ZVV-Verbund-Betriebe, `MIXED` wenn beide an einer Site halten.

### Wichtiges

- GTFS-Updates erscheinen wöchentlich auf opentransportdata.swiss. Jedes Re-Import-ZIP → neuer `ImportFile` + `ImportRun`.
- Bestehende `SiteLineAssignment`-Datensätze werden **ersetzt**, nicht historisiert (Frequenz spiegelt den aktuellen Stand). Historie ergibt sich aus der `ImportFile`-Kette über die Zeit.
- **Kein Bulk-Geocoding nötig** — GTFS liefert Koordinaten direkt.

---

## Kanal 3 — POI / Event-Locations

`ImportType = POI_EVENT_LOCATIONS`. Verarbeitung synchron im API-Request.

### Format

| Pflicht | Spalte | Ziel-Feld |
|---|---|---|
| ✔ | `name` | `PointOfInterest.name` |
| ✔ | `category` | `PointOfInterest.category` (freier String) |
| ✔ | `lat`, `lon` **oder** `address` | siehe unten |
| (optional) | `relevance` (`LOW` / `MEDIUM` / `HIGH` / `CRITICAL`) | `PointOfInterest.relevance` (Default `MEDIUM`) |
| (optional) | `valid_from`, `valid_to` | für Events |

### Geocoding-Regel

- **`lat`/`lon` vorhanden** → direkt verwenden.
- **Nur `address`** → kein automatisches Bulk-Geocoding:
  - Zeile landet als `ImportError` mit `reason = "needs_geocoding"`, `ImportRun.status = NEEDS_REVIEW`.
  - UI bietet pro Zeile einen "Geocode now"-Button → **einzelner** Nominatim-Lookup mit User-Agent-Header (siehe `osm-strategy.md`).
  - Bulk-Lookups (≥ 10) sind UI-seitig gesperrt.

### POI → Site-Zuordnung

POIs werden **nicht** beim Import an eine Site gehängt. Die Zuordnung erfolgt im Scoring-Run als räumlicher Query (Default-Radius 300 m), persistiert als `SitePoiRelation` mit `distanceMeters`. So bleibt der POI-Datenbestand unabhängig editierbar.

---

## Was jeder `ImportRun` hinterlässt

- **`ImportRun`** — `status`, `rowsTotal/Accepted/Rejected`, `summary` (freie Counters je Importtyp).
- **`ImportError[]`** pro fehlerhafter Zeile — `rowNumber`, `field`, `reason`, `rawValue`.
- **`ImportMapping[]`** — was wurde wohin gemappt, optional mit Transform.
- **File-Audit** (append-only): `storage/processed/import-log.jsonl` — eine Zeile pro Run, für Audit ausserhalb der DB.

Beispiel-Audit-Zeile:

```json
{
  "runId": "ck...",
  "fileId": "ck...",
  "importType": "HARDWARE_INVENTORY",
  "originalFilename": "vbz-bestand-2026-05.xlsx",
  "contentHash": "sha256:...",
  "startedAt": "2026-05-16T10:12:33Z",
  "finishedAt": "2026-05-16T10:12:35Z",
  "status": "COMPLETED",
  "rowsTotal": 412, "rowsAccepted": 401, "rowsRejected": 11,
  "summary": { "sitesMatched": 388, "sitesUnmatched": 13 }
}
```

---

## Fehlerbehandlung

| Fehlerart | Verhalten |
|---|---|
| Datei nicht lesbar / falsches Format | `status = FAILED`, kein Persist, Diagnose in `summary` |
| Schema-Mismatch (Pflichtspalten fehlen) | `status = FAILED`, fehlende Spalten in `summary.missingColumns` |
| Einzelne Zeilen ungültig | `ImportError`-Record, Rest wird verarbeitet, `status = COMPLETED` oder `NEEDS_REVIEW` |
| Match-Konflikte (ein Excel-Eintrag → mehrere Site-Kandidaten) | Beide Kandidaten als `ImportError` mit Detail; `status = NEEDS_REVIEW`; Datensatz wird persistiert (Confidence-Abzug bei späterer Empfehlung) |
| `contentHash` bereits vorhanden | API-Skip mit Hinweis; neuer `ImportRun` an bestehender `ImportFile` nur per explizitem Re-Process-Flag |
