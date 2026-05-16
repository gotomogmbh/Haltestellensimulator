# MVP Roadmap — Haltestellensimulator

Phasen-Sicht auf den Weg zum MVP. Die **technische 13-Schritte-Sequenz** steht in `architecture.md` ("Reihenfolge der Implementierung").

## Phase 0 — Setup ✅

Erledigt:
- Git-Repo angelegt, Remote `gotomogmbh/Haltestellensimulator` verbunden.
- Projektordner-Skelett (`docs/`, `storage/uploads/{excel,gtfs,poi}`, `storage/processed/`, `data/samples/`).
- Basis-Docs: `README.md`, `CLAUDE.md`, `.gitignore`, `.env.example`.
- Konzept-Docs: `concept`, `data-model`, `import-pipeline`, `osm-strategy`, `scoring`, `architecture`, `setup`, `mvp-roadmap`.

## Phase 1 — Tech-Stack & Projektgerüst ✅

Erledigt:
- Next.js 15 (App Router) + React 19 + TypeScript scaffolded.
- ESLint (`next/core-web-vitals`), TS-strict, `@/*`-Alias.
- `docker-compose.yml` mit PostgreSQL 16 + PostGIS 3.4 (User `app`, DB `haltestellensimulator`, Port 5432).
- Prisma 6 mit vollständigem Datenmodell (`prisma/schema.prisma`) und aktivierter PostGIS-Extension.
- Sechs Stub-Seiten: `/`, `/imports`, `/sites`, `/pois`, `/scoring`, `/map`.
- `docs/setup.md` mit lokalem Dev-Workflow.

**Offen** (User-Aktion): `pnpm install && pnpm db:up && pnpm prisma migrate dev --name init && pnpm dev`.

## Phase 2 — Datenmodell & Persistenz

Ziel: Migration durchgespielt, Persistenz-Layer und Schema-Validierung in Code.

- [ ] Erste Prisma-Migration ausführen (`prisma migrate dev --name init`).
- [ ] `src/lib/db.ts` — Prisma-Client-Singleton (Next.js-safe, kein Re-Init in HMR).
- [ ] `src/lib/storage/adapter.ts` (Interface) + `local-fs.ts` + `index.ts`-Factory.
- [ ] Zod-Schemas für API-Inputs und JSONB-Reads.
- [ ] Unit-Tests für Persistenz-Layer (Roundtrip, Validierung).

**Definition of Done**: Synthetische Sites + Hardware-Inventar können in der DB geschrieben, gelesen und validiert werden.

## Phase 3 — Import-Pipeline

Ziel: Drei Kanäle (Hardware-Inventar, GTFS, POI) bringen Daten in die DB. Architektur in `import-pipeline.md`.

- [ ] **Hardware-Inventar (Excel)**:
  - [ ] Datei-Upload-Handler über `StorageAdapter`.
  - [ ] Excel-Parser + Schema-Validator + Enum-Normalisierung (`ja/yes/1 → YES`).
  - [ ] Site-Matching (DiDok → Name+Geo → Fuzzy → Geo-only).
  - [ ] `ImportFile` + `ImportRun` + `ImportError` + `ImportMapping`-Records.
- [ ] **GTFS (CLI `pnpm gtfs:import`)**:
  - [ ] ZIP-Entpacker.
  - [ ] `stops.txt` → `BoardingPoint` + `Site`-Aggregat.
  - [ ] `routes.txt` → `TransitLine`.
  - [ ] `stop_times.txt` + `calendar.txt` → `SiteLineAssignment` (Frequenz).
  - [ ] `OperatorArea`-Ableitung pro Site.
- [ ] **POI**:
  - [ ] Excel/CSV-Reader.
  - [ ] Validierung + `relevance`-Enum.
  - [ ] Adress-only → `ImportError` mit `reason = "needs_geocoding"`.
- [ ] Sample-Daten in `data/samples/` für Tests.

**Definition of Done**: Ein realer VBZ-Excel-Export + ein GTFS-Paket + eine POI-Liste werden ohne manuelle Eingriffe importiert; `ImportRun.summary` zeigt nachvollziehbares Ergebnis.

## Phase 4 — Scoring-Engine

Ziel: `ScoringRun` erzeugt `Recommendation` pro Site gemäss `scoring.md`.

- [ ] Aggregation der Inputs (Frequenz aus `SiteLineAssignment`, POI-Kontext aus `SitePoiRelation`).
- [ ] Regel-Engine: `elementSize`, `elementCount`, `hardwareClass`, `scoreBreakdown`, `confidence`, `reasoning[]`.
- [ ] `ruleVersion` + `inputsSnapshot` schreiben.
- [ ] Snapshot-Tests mit ≥ 20 synthetischen Sites über alle HW-Klassen.

**Definition of Done**: Für die Sample-Daten werden Empfehlungen erzeugt, die ein:e Planer:in als plausibel beurteilt.

## Phase 5 — UI

Ziel: Bedienbarer Durchstich Upload → Karte → Detail → Export.

- [ ] **`/imports`** + Upload-Flows (Hardware, POI), Log-Viewer.
- [ ] **`/sites`** + **`/sites/[id]`** (Inputs, Empfehlung, Reasoning, Score-Breakdown, Historie).
- [ ] **`/pois`** + Einzel-Geocode-Button (Nominatim).
- [ ] **`/scoring`** read-only Parameter-Ansicht + `ScoringRun`-Historie.
- [ ] **`/map`** mit MapLibre + OpenFreeMap, Site-Layer (Farbe nach `hardwareClass`, Opacity nach `confidence`), POI-Layer toggle.
- [ ] **`/`** (Dashboard) mit Counts + Confidence-Verteilung + neuesten Imports.
- [ ] Excel-/CSV-Export der Empfehlungstabelle.
- [ ] OSM-Attribution dauerhaft in der Map-Komponente sichtbar.

**Definition of Done**: Vollständiger Durchstich, demobereit.

## Phase 6 — Backlog (nach MVP)

- Nominatim-Einzel-Geocoding für POIs ohne Koordinaten.
- Overpass-POI-Vorschläge in Site-Umgebung.
- Auth / Mehrbenutzer-Workflow.
- Vergleichsmodus: zwei `ScoringRun`-Snapshots nebeneinander.
- Bulk-Edit der Hardware-Inventar-Flags in der UI.
- Job-Queue (BullMQ + Redis oder Inngest) für lange GTFS-Imports und parallele Recomputes.
- Geometry-Columns in PostGIS + GIST-Indizes (statt rein `latitude/longitude`).
- Eigener Tile-Server (Migration weg von OpenFreeMap, falls nötig).

---

## Offene Entscheidungen

| Thema | Status |
|---|---|
| Exakte Excel-Spaltennamen VBZ | offen — vor Phase 3 klären |
| `OperatorArea`-Ableitung (Schwelle für `MIXED`) | offen |
| `PoiRelevance`-Defaults je Kategorie | offen — vor Phase 3 klären |
| Tile-Provider in Produktion (OpenFreeMap vs MapTiler vs self-hosted) | später, sobald Last-Zahlen vorliegen |
| Scoring-Gewichte | Phase 4 mit Kund:in kalibrieren |
