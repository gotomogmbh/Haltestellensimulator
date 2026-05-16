# MVP Roadmap — Haltestellensimulator

Phasenplan bis zum lieferbaren MVP. Reihenfolge ist **bewusst**: erst Datenmodell, dann Importlogik, dann UI (siehe CLAUDE.md).

## Phase 0 — Setup (✅ läuft)

- Git-Repo angelegt, Remote `gotomogmbh/Haltestellensimulator` verbunden.
- Projektordner-Skelett (`docs/`, `storage/uploads/{excel,gtfs,poi}`, `storage/processed/`, `data/samples/`).
- Basis-Docs: README, CLAUDE.md, .gitignore, .env.example.
- Konzept-Docs: concept, data-model, import-pipeline, osm-strategy, scoring, mvp-roadmap.

**Definition of Done**: Alle Konzept-Docs liegen vor und sind committet.

---

## Phase 1 — Tech-Stack & Projektgerüst

Ziel: lauffähiges, leeres Projekt mit dem entschiedenen Stack.

- [ ] **Stack-Entscheidung** (Vorschlag: Vite + React + TypeScript, konsistent mit GBS / PFA).
- [ ] Projekt-Bootstrap (`package.json`, `tsconfig.json`, Vite-Config).
- [ ] Linting + Formatting (ESLint + Prettier — gleiche Regeln wie GBS).
- [ ] Basis-Verzeichnisstruktur (`src/`, `src/features/`, `src/lib/`, `src/types/`).
- [ ] CI: GitHub Actions mit `typecheck` + `lint` + `build`.
- [ ] Dev-Server läuft mit Platzhalter-Seite.

**Definition of Done**: `pnpm dev` (oder Äquivalent) startet eine leere Seite; CI ist grün.

---

## Phase 2 — Datenmodell & Persistenz

Ziel: TypeScript-Typen + lokale Persistenz-Layer für alle Entitäten aus `data-model.md`.

- [ ] Enums + Types: `YesNoUnknown`, `ElementSize`, `HardwareClass`, `Stop`, `StopAttributes`, `StopFrequency`, `PoiLocation`, `StopPoiContext`, `Recommendation`, `ImportBatch`, `ImportLog`.
- [ ] Persistenz-Adapter (zunächst Datei-basiert: `storage/processed/*.json`).
- [ ] Schema-Validierung (Zod) für alle Persistenz-Reads.
- [ ] Unit-Tests für die Persistenz-Layer (Roundtrip, Validierung).

**Definition of Done**: Synthetische Stop-Daten können geschrieben, gelesen und validiert werden.

---

## Phase 3 — Import-Pipeline

Ziel: Drei Kanäle (Excel, GTFS, POI) bringen Daten in den `storage/processed`-Layer.

- [ ] **Excel-Import** (Bestandsdaten):
  - [ ] Datei-Upload-Handler (lokal, kein Cloud).
  - [ ] Schema-Validator + Enum-Normalisierung (`ja/yes/1 → yes` etc.).
  - [ ] GTFS-Matching (DiDok → Name+Geo → Fuzzy → Geo-only).
  - [ ] Rejections-Liste + `needs_manual_match`-Flag.
  - [ ] `ImportBatch` + `ImportLog` schreiben.
- [ ] **GTFS-Import**:
  - [ ] ZIP-Entpacker.
  - [ ] `stops.txt` → `Stop`.
  - [ ] Frequenz-Berechnung aus `stop_times` + `calendar`.
  - [ ] Operator-Ableitung (ZVV / VBZ).
- [ ] **POI-Import**:
  - [ ] Excel/CSV-Reader.
  - [ ] `needs_geocoding`-Flag wenn nur Adresse vorhanden.
  - [ ] Bulk-Geocoding-Verbot durchsetzen (UI-Layer in Phase 4).
- [ ] **Sample-Daten** in `data/samples/` für Tests.

**Definition of Done**: Ein realer ZVV-Excel-Export + ein GTFS-Paket + eine POI-Liste werden ohne manuelle Eingriffe importiert; Log-Datei zeigt nachvollziehbares Ergebnis.

---

## Phase 4 — Scoring-Engine

Ziel: `Recommendation` für jeden `Stop` aus Inputs berechnen.

- [ ] Regel-Engine gemäss `scoring.md`:
  - [ ] Elementgrösse (Frequenz + POI-Modifikator + Wartehaus-Modifikator).
  - [ ] Anzahl Elemente.
  - [ ] Hardware-Integrationsklasse (A–G).
  - [ ] Score-Aufteilung.
  - [ ] Confidence (Basis + Abzüge).
  - [ ] `reasoning[]`-Generator (deutsche Texte mit Belegen).
- [ ] `rule_version`-Mechanismus + `inputs_snapshot`.
- [ ] Tests: Snapshot-Tests mit ≥ 20 synthetischen Stops, die jede HW-Klasse abdecken.

**Definition of Done**: Für die Sample-Daten werden Empfehlungen erzeugt, die ein:e Planer:in als plausibel beurteilt.

---

## Phase 5 — UI

Ziel: Bedienbare Web-Oberfläche.

- [ ] **Layout**: Sidebar (Filter / Imports) + Karte + Detailpanel.
- [ ] **Karte** (Leaflet oder MapLibre, OSM-Tiles):
  - [ ] Stop-Layer (gefärbt nach HW-Klasse oder Confidence).
  - [ ] POI-Layer (optional einblendbar).
  - [ ] Klick → Detailansicht.
- [ ] **Detail-Panel** pro Stop:
  - [ ] Inputs (5 Flags, Frequenz, POI-Kontext).
  - [ ] Empfehlung (Grösse, Anzahl, HW-Klasse, Reasoning, Confidence).
  - [ ] Score-Breakdown (Balken / Werte).
- [ ] **Imports-Ansicht**: Upload-UI, Verlauf der `ImportBatch`es, Log-Viewer.
- [ ] **Export**: Empfehlungs-Tabelle als Excel/CSV.
- [ ] OSM-Attribution sichtbar.

**Definition of Done**: Vollständiger Durchstich Upload → Karte → Detail → Export.

---

## Phase 6 — Optionale Erweiterungen (Backlog)

- [ ] Nominatim-Einzel-Geocoding für POIs ohne Koordinaten.
- [ ] Overpass-Vorschläge für POIs in Stop-Umgebung.
- [ ] DB-Backend (SQLite / DuckDB) statt JSON-Dateien.
- [ ] Auth / Mehrbenutzer-Workflow.
- [ ] Vergleichsmodus: zwei Empfehlungs-Snapshots nebeneinander.
- [ ] Bulk-Edit von Pflicht-Flags in der UI.
- [ ] Karten-Tile-Server selbst hosten (falls Last-Bedarf da).

---

## Risiken & offene Entscheidungen

| Thema | Status |
|---|---|
| Exakte Excel-Spaltennamen von ZVV / VBZ | offen — vor Phase 3 klären |
| Operator-Zuordnung (ZVV vs VBZ) auf GTFS-Ebene | offen |
| Tile-Provider in Produktion | später entscheiden (siehe `osm-strategy.md`) |
| Gewichtungen in Scoring | Phase 4 mit Kund:in kalibrieren |
| Lokale Persistenz vs. DB | aktuell JSON-Files; ggf. nach MVP DB einführen |
