# Haltestellensimulator

Web-App zur Planung und Bewertung modularer **Fahrgastinformations-Elemente (FGI)** an ZVV-/VBZ-Haltestellen.

Die App unterstützt das ZVV-/VBZ-Team dabei, pro Haltestelle eine begründete Empfehlung zu treffen:

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

## Projektstruktur

```
.
├── README.md                  # dieses File
├── CLAUDE.md                  # Arbeitskontext für Claude-Sessions
├── .env.example               # Vorlage für lokale Env-Variablen
├── docs/
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

Tech-Stack ist noch nicht festgelegt — wird in `docs/mvp-roadmap.md` Phase 1 entschieden. Empfehlung: Vite + React + TypeScript (konsistent mit übrigen Gotomo-Projekten).

```bash
git clone https://github.com/gotomogmbh/Haltestellensimulator
cd Haltestellensimulator
cp .env.example .env
```

## Repository

https://github.com/gotomogmbh/Haltestellensimulator
