# CLAUDE.md

Zentrale Projektanweisung für Claude Code. Dieses File ist die **Single Source of Truth** für Scope, Datenquellen, Domänenmodell und Vorgehensregeln. Jede Claude-Session liest dieses File zuerst.

---

## Projektname

**Haltestellensimulator**

## Lokaler Ordner

`~/Desktop/Haltestelle Simulator`

## Git-Remote

`https://github.com/gotomogmbh/Haltestellensimulator`

---

## Projektkontext

Wir bauen eine Web-App für **ZVV-/VBZ-Haltestellen** zur **Planung eines neuen modularen Fahrgastinformationskonzepts**.

Die App unterstützt Planer:innen dabei, pro Haltestelle eine begründete Empfehlung zu erzeugen:

- welche **Elementgrösse** (S / M / L / XL / XXL),
- welche **Hardware-Integrationsklasse** (A–G),
- wie viele **Elemente** empfohlen werden,
- **warum** (Begründung + Score-Aufteilung),
- mit welcher **Confidence** (Datenqualität).

Eingabedaten: GTFS, Excel-Bestandsdaten, POI-/Event-Listen. Karte: OSM.

---

## Nicht im Scope

- **Keine SBB-Bahnhöfe** als eigene Objekte (Bahnhof-Hauptobjekte werden nicht modelliert).
- **Keine bauliche Sanierungsplanung** (Bautechnik, Statik, Tiefbau).
- **Keine Einstiegshöhen- / BehiG-Bewertung** als Kernfunktion.
- **Keine Google-Maps-Kernabhängigkeit** — weder für Karten noch für Geocoding.

---

## Datenquellen

| Quelle | Zweck | MVP-Status |
|---|---|---|
| **GTFS / OpenTransportData** (opentransportdata.swiss) | Haltestellen, Linien, Fahrplandichte | MVP |
| **Excel- / CSV-Uploads** | ZVV-/VBZ-Bestandsdaten zu Pflichtmerkmalen | MVP |
| **POI- / Event-Location-Dateien** | Relevanz-Anreicherung im Scoring | MVP |
| **OSM-basierte Karte** | Karten-Hintergrund (z. B. Leaflet + OSM-Tiles) | MVP |
| **OSM / Nominatim** | Optional, später, **Einzel-Geocoding** | Backlog |
| **OSM / Overpass** | Optional, später, **POI-Vorschläge** in Umgebung | Backlog |

Regel: **Kein automatisches Bulk-Geocoding über öffentliche OSM-Dienste.** Nominatim/Overpass werden nur für einzelne, manuell ausgelöste Lookups verwendet, um die Usage-Policies einzuhalten.

---

## Pflichtmerkmale je Haltestelle

Jede Haltestelle führt fünf Status-Flags. Erlaubte Werte: **`yes`** / **`no`** / **`unknown`**.
`unknown` ist First-Class — Logik darf nicht stillschweigend in `no` umfallen.

| Feld | Bedeutung |
|---|---|
| `dfi_standfuss` | DFI mit eigenem Standfuss vorhanden |
| `dfi_strommast` | DFI an bestehendem Strommast / Stange montiert |
| `ticketautomat` | Ticketautomat vorhanden |
| `strom` | Stromanschluss vor Ort vorhanden |
| `wartehaus` | Wartehaus / Unterstand vorhanden |

---

## Ziel-Empfehlung (Output je Haltestelle)

Jede Berechnung liefert ein vollständiges, nachvollziehbares Empfehlungsobjekt:

1. **Elementgrösse** — `S` | `M` | `L` | `XL` | `XXL`
2. **Hardware-Integrationsklasse** — siehe Tabelle unten
3. **Anzahl empfohlener Elemente** — Ganzzahl ≥ 0
4. **Begründung** — strukturierte `reasoning[]`-Liste (Mensch lesbar)
5. **Score-Aufteilung** — Beiträge der einzelnen Faktoren (Frequenz, POI-Relevanz, Infrastruktur etc.)
6. **Confidence** — 0.0–1.0, abgeleitet aus Anteil bekannter Flags und Datenaktualität

Details: `docs/scoring.md`.

---

## Hardware-Integrationsklassen

Die Klasse beschreibt, **wie** ein neues FGI-Element an der Haltestelle integriert werden kann — geordnet nach absteigender Wiederverwendung bestehender Infrastruktur:

| Code | Bedeutung |
|---|---|
| `A_REUSE_DFI_STANDALONE` | Bestehende DFI mit Standfuss kann wiederverwendet / aufgerüstet werden |
| `B_REUSE_DFI_POLE` | Bestehende Strommast-DFI kann wiederverwendet / aufgerüstet werden |
| `C_REUSE_TICKET_MACHINE` | Ticketautomat-Standort / -Infrastruktur kann mitgenutzt werden |
| `D_REUSE_SHELTER` | Wartehaus vorhanden — Integration ins Wartehaus möglich |
| `E_POWER_AVAILABLE_NEW_MOUNT` | Strom vorhanden, aber keine wiederverwendbare Halterung — neue Montage nötig |
| `F_NO_HARDWARE` | Weder Strom noch nutzbare Infrastruktur — Neubau / Autarkielösung |
| `G_UNKNOWN` | Datenlage unzureichend — Klassifizierung nicht möglich |

Regel: Wird `G_UNKNOWN` zurückgegeben, muss die `reasoning[]` explizit benennen, **welche** Flags fehlen.

---

## Vorgehensregeln (für Claude)

1. **Reihenfolge**: Zuerst **Architektur und Datenmodell**, dann **Importlogik**, dann **UI**. Keine UI-Implementierung beginnen, solange `docs/data-model.md` und `docs/import-pipeline.md` nicht abgestimmt sind.
2. **Lokale Persistenz im MVP**: Uploads landen unter `storage/uploads/{excel,gtfs,poi}/`. Verarbeitete Artefakte unter `storage/processed/`. Keine Cloud-Bucket-Anbindung im MVP.
3. **Import-Protokollierung ist Pflicht**: Jeder Import (Excel, GTFS, POI) erzeugt einen Eintrag mit Zeitstempel, Quelle, Dateiname, Hash, Zeilen-Counts und Fehlerprotokoll. Siehe `docs/import-pipeline.md`.
4. **Kein automatisches Bulk-Geocoding** über öffentliche OSM-Dienste (Nominatim / Overpass). Bulk-Anreicherung erfolgt offline / vorbereitet; öffentliche APIs nur für einzelne, manuell ausgelöste Lookups.
5. **POI- / Event-Relevanz** ist Teil des Scorings — nicht nur Frequenz allein. Eine Haltestelle in der Nähe einer Event-Location bekommt einen höheren Anzahl-Vorschlag.
6. **Sprache**: Dokumentation und UI-Strings auf **Deutsch**. Code, Identifier, Klassencodes (`A_REUSE_*` etc.) auf **Englisch**.
7. **Bevorzugter Stack**: Vite + React + TypeScript (konsistent mit GBS / PFA). Finalisierung in `docs/mvp-roadmap.md` Phase 1.
8. **OSM only** — keine Google-Maps-, Mapbox- oder anderen proprietären Karten-APIs vorschlagen.
9. **Determinismus**: Scoring liefert bei gleichen Inputs immer das gleiche Ergebnis. Keine ML-Blackbox im MVP.

---

## Domänen-Glossar

| Begriff | Bedeutung |
|---|---|
| **FGI-Element** | Modulares Fahrgastinformations-Element (S / M / L / XL / XXL) |
| **DFI** | Dynamische Fahrgastinformation (Display mit Abfahrtszeiten) |
| **Standfuss-DFI** | DFI mit eigener freistehender Halterung |
| **Strommast-DFI** | DFI an bestehender Stange / Mast |
| **HW-Klasse** | Hardware-Integrationsklasse A–G |
| **GTFS** | General Transit Feed Specification — Fahrplandaten via opentransportdata.swiss |
| **POI** | Points of Interest / Event-Locations im Umfeld einer Haltestelle |
| **Confidence** | Datenqualitätsmass 0.0–1.0 pro Empfehlung |

---

## Weiterführende Docs

- `docs/concept.md` — Vision, Nutzer:innen, Use Cases
- `docs/data-model.md` — Entitäten, Felder, Beziehungen
- `docs/import-pipeline.md` — Upload → Validate → Match → Persist → Log
- `docs/osm-strategy.md` — OSM-Nutzung (Karte / Geocoding / POI)
- `docs/scoring.md` — Empfehlungslogik (Grösse, Anzahl, HW-Klasse, Confidence)
- `docs/mvp-roadmap.md` — Phasen bis MVP
