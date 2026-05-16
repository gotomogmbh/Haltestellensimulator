# Concept — Haltestellensimulator

## Vision

Eine Web-App, die Planer:innen befähigt, **datengestützt und nachvollziehbar** zu entscheiden, welche modularen Fahrgastinformations-(FGI-)Elemente an welcher Haltestelle sinnvoll sind.

Statt Bauchgefühl oder Excel-Tabellen: pro Haltestelle eine **begründete Empfehlung** mit Score-Aufteilung und Confidence.

## Stakeholder & Owner

- **Owner der Haltestellen**: **VBZ**.
- **Auftraggeber**: **VBZ + ZVV gemeinsam**.
- **MVP-Scope**: ausschliesslich VBZ-Sites (`operatorArea = VBZ`). Weitere ZVV-Verbund-Betriebe (VBG, SZU, PostAuto …) sind im Datenmodell vorgesehen, aber nicht im MVP.

## Problem

Heute:
- Bestandsdaten zu Haltestellen liegen in **Excel** verstreut.
- Beurteilung "wie viele Displays, welche Grösse, wo" erfolgt **manuell und uneinheitlich**.
- Es fehlt eine **gemeinsame Sicht** auf Frequenz (GTFS), Infrastruktur (Strom, Wartehaus, vorhandene DFI) und Umfeld (POIs, Events).
- Empfehlungen sind **nicht reproduzierbar** und nicht versioniert.

## Lösung (in einem Satz)

Ein Tool, das GTFS + Excel-Bestandsdaten + POI-Listen kombiniert und pro Haltestelle eine **regelbasierte, deterministische Empfehlung** für Grösse, Anzahl und Hardware-Integrationsklasse eines FGI-Elements erzeugt — inkl. Begründung und Confidence.

## Nutzer:innen

| Persona | Rolle | Hauptnutzen |
|---|---|---|
| **Planer:in ZVV / VBZ** | Steuert das Roll-out neuer FGI-Elemente | Erhält pro Haltestelle eine begründete Empfehlung; kann Szenarien vergleichen |
| **Projektleiter:in Gotomo** | Operativ-/Beratungsrolle | Pflegt Daten, validiert Empfehlungen, exportiert Reports |
| **Stakeholder ZVV / VBZ** | Entscheidungsträger:in | Liest aggregierte Reports, prüft Confidence und Begründung |

## Use Cases (MVP)

1. **Bestandsdaten hochladen** — Excel mit Haltestellen-Flags (DFI, Strom, Wartehaus, Ticketautomat) importieren.
2. **GTFS laden** — aktuelles GTFS von OpenTransportData einlesen oder lokale Kopie verwenden.
3. **POIs / Events hochladen** — relevante Locations im Umfeld als Excel/CSV importieren.
4. **Matching** — Excel-Haltestellen gegen GTFS-Stops mappen (Name + Geo).
5. **Empfehlung berechnen** — pro Haltestelle Grösse / Anzahl / HW-Klasse / Begründung / Confidence.
6. **Karte erkunden** — OSM-Karte mit Haltestellen-Layer, gefärbt nach HW-Klasse oder Confidence.
7. **Detailansicht** — pro Haltestelle: Inputs, Empfehlung, Score-Aufteilung, Begründung.
8. **Export** — Empfehlungs-Tabelle als Excel/CSV herunterladen.

## Nicht-Ziele (explizit ausgeschlossen)

- Kein **Echtzeit-Fahrgastinformationssystem** (kein DFI-Inhalt im Betrieb).
- Kein **Sanierungs- / Bauplanungstool**.
- Keine **BehiG- / Einstiegshöhen-Bewertung** als Kernfunktion.
- Keine **SBB-Bahnhöfe** als eigenständige Objekte.
- Keine **Google-Maps-Integration**.

## Erfolgskriterien (MVP)

- Planer:innen können einen vollständigen Excel-Upload in **< 2 Minuten** verarbeiten lassen.
- Mindestens **80 %** der VBZ-Haltestellen aus Excel werden automatisch gegen GTFS gematcht.
- Jede Empfehlung enthält eine **Begründung** und eine **Confidence**.
- Empfehlungen sind **reproduzierbar**: gleicher Input → gleiches Ergebnis.
- Karte und Empfehlung laden für einen typischen Datensatz in **< 3 Sekunden**.

## Phasen-Übersicht

Siehe `mvp-roadmap.md` für Details.

1. **Konzept & Datenmodell** (Docs, Architekturentscheidungen) — laufend
2. **Import-Pipeline** (Excel, GTFS, POI) — als nächstes
3. **Scoring-Engine** — danach
4. **UI** (Karte, Detail, Export) — zum Schluss
