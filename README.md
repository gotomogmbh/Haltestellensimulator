# Haltestellensimulator

Web-App zur Planung und Bewertung modularer **Fahrgastinformations-Elemente (FGI)** an **VBZ-Haltestellen**.

- **Owner der Haltestellen**: VBZ (Verkehrsbetriebe Zürich)
- **Auftraggeber**: VBZ + ZVV gemeinsam
- **MVP-Scope**: ausschliesslich VBZ-Haltestellen; weitere ZVV-Verbund-Betriebe (VBG, SZU, PostAuto …) sind im Datenmodell vorgesehen, aber nicht im MVP

Die App unterstützt das VBZ-/ZVV-Team dabei, pro Haltestelle eine begründete Empfehlung zu treffen:

- welche **Elementgrösse** (S, M, L, XL, XXL) sinnvoll ist,
- wie viele **Elemente** voraussichtlich nötig sind,
- in welche **Hardware-Integrationsklasse** die Haltestelle fällt,
- **warum** (Begründung),
- mit welcher **Datenqualität / Confidence** die Empfehlung erfolgt.

## Scope-Abgrenzung

- **Nicht** SBB-Bahnhöfe als eigene Objekte.
- **Nicht** bauliche Sanierung der Haltestelle.
- **Nur** Fahrgastinformation (digitale + ergänzende Elemente).

## Datenquellen

- **GTFS** von [opentransportdata.swiss](https://opentransportdata.swiss) — Liniennetz, Haltestellen, Fahrplandichte.
- **Excel/CSV-Uploads** — Bestandsdaten zu Haltestellen (DFI, Strom, Wartehaus, Ticketautomat etc.) und POIs / Event-Locations.
- **OSM** — Kartenhintergrund und (optional, später) Geocoding / POI-Vorschläge. **Kein Google Maps.**

## Pflichtmerkmale pro Haltestelle

Jede Haltestelle wird mit fünf Status-Flags geführt (`yes` / `no` / `unknown`):

| Flag | Bedeutung |
|---|---|
| `dfi_standfuss` | Dynamische Fahrgastinformation mit eigenem Standfuss vorhanden |
| `dfi_strommast` | DFI am Strommast / bestehender Stange montiert |
| `ticketautomat` | Ticketautomat vorhanden |
| `strom` | Stromanschluss vor Ort vorhanden |
| `wartehaus` | Wartehaus / Unterstand vorhanden |

Aus diesen Flags + GTFS-Frequenz + POI-Kontext leitet die App die Empfehlung ab (siehe `docs/scoring.md`).

## Tech-Stack

- **Next.js + TypeScript** (App Router)
- **PostgreSQL 16 + PostGIS 3.x**
- **Prisma** (ORM, PostGIS-Geometrie via `Unsupported(...)` + `$queryRaw`)
- **MapLibre GL** + **OpenFreeMap** (Vector Tiles, OSM-basiert)
- Lokaler Upload-Storage `storage/uploads/` über `StorageAdapter`-Interface (später Supabase/S3 möglich)

Details und Begründungen in `docs/architecture.md`.

## Projektstruktur

```
.
├── README.md                  # dieses File
├── CLAUDE.md                  # Arbeitskontext für Claude-Sessions
├── .env.example               # Vorlage für lokale Env-Variablen
├── docs/
│   ├── architecture.md        # Technische MVP-Architektur (Stack, Struktur, API)
│   ├── concept.md             # Vision, Scope, Nutzer:innen
│   ├── data-model.md          # Entitäten, Felder, Beziehungen
│   ├── import-pipeline.md     # Upload → Validate → Match → Persist
│   ├── osm-strategy.md        # Nutzung von OSM (Karte / Geocoding / POI)
│   ├── scoring.md             # Empfehlungslogik (Grösse, Anzahl, HW-Klasse, Confidence)
│   └── mvp-roadmap.md         # Phasen bis MVP
├── storage/
│   ├── uploads/
│   │   ├── excel/             # hochgeladene Excel-Bestandsdaten
│   │   ├── gtfs/              # heruntergeladene GTFS-Pakete
│   │   └── poi/               # POI- / Event-Location-Listen
│   └── processed/             # normalisierte / gematchte Artefakte
└── data/
    └── samples/               # Beispiel-Datensätze für Entwicklung & Tests
```

## Setup

```bash
git clone https://github.com/gotomogmbh/Haltestellensimulator
cd Haltestellensimulator
cp .env.example .env
# Datenbank lokal starten (sobald docker-compose vorhanden):
# docker compose up -d
# pnpm install && pnpm prisma migrate dev && pnpm dev
```

## Repository

https://github.com/gotomogmbh/Haltestellensimulator
