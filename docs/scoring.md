# Scoring — Empfehlungslogik

Definiert, **wie** der Haltestellensimulator pro `Site` eine `Recommendation` berechnet.

Stand: **Entwurf v0** — Schwellwerte und Gewichte sind erste Vorschläge und werden mit VBZ/ZVV kalibriert.

## Designprinzipien

1. **Deterministisch** — gleicher Input → gleiches Ergebnis. Keine ML-Blackbox im MVP.
2. **Erklärbar** — jede Empfehlung enthält `reasoning[]` (Mensch lesbar) und `scoreBreakdown` (Komponenten).
3. **Versioniert** — jede Empfehlung trägt `ruleVersion` (z. B. `scoring@0.3.0`); ältere Empfehlungen bleiben reproduzierbar.
4. **`UNKNOWN` respektieren** — fehlende Daten ziehen Confidence runter, defaulten nicht zu `NO`.
5. **POI-Relevanz fliesst ein** — eine Site bei einer kritischen Event-Location bekommt einen höheren Anzahl-Vorschlag.
6. **Lauf-getrieben** — jede Berechnung gehört zu einem `ScoringRun`; Inputs werden in `inputsSnapshot` eingefroren.

---

## Output (siehe `data-model.md` → `Recommendation`)

```ts
type Recommendation = {
  siteId: string;
  scoringRunId: string;
  elementSize: "S" | "M" | "L" | "XL" | "XXL";
  elementCount: number;                       // ≥ 0
  hardwareClass: HardwareIntegrationClass;    // A_… | … | G_UNKNOWN
  reasoning: string[];                        // deutsche Bullets
  scoreBreakdown: {
    frequency: number;                        // 0..1
    poiRelevance: number;                     // 0..1
    infrastructure: number;                   // 0..1
    rawTotal: number;
    weightedTotal: number;
  };
  confidence: number;                         // 0..1
  inputsSnapshot: unknown;
  ruleVersion: string;                        // z. B. "scoring@0.3.0"
};
```

---

## Inputs

Pro `Site` werden gelesen:

| Quelle | Felder |
|---|---|
| `SiteHardwareInventory` | `dfiStandfuss`, `dfiStrommast`, `ticketautomat`, `strom`, `wartehaus` (je `YesNoUnknown`) |
| `SiteLineAssignment` (Aggregat) | Summe `weekdayDepartures` über alle Linien; `served_routes_count` = Anzahl Zuordnungen |
| `SitePoiRelation` + `PointOfInterest` | POIs im 300-m-Radius mit ihrer `relevance` (Enum) und ggf. `validFrom/validTo` |

POI-Relevanz wird zur Score-Berechnung **numerisch gewichtet**:

| `PoiRelevance` | Gewicht |
|---|---|
| `LOW` | 0.25 |
| `MEDIUM` | 0.5 |
| `HIGH` | 1.0 |
| `CRITICAL` | 2.0 |

Daraus ergibt sich `poiRelevanceSum = Σ Gewicht(relevance)` über POIs im Radius.

---

## 1. Elementgrösse (`elementSize`)

Bestimmt durch **Frequenz** (Summe der Werktagsabfahrten) mit Modifikatoren.

### Basis: Tägliche Abfahrten

| `weekdayDeparturesSum` | Basis-Grösse |
|---|---|
| < 50 | `S` |
| 50–199 | `M` |
| 200–499 | `L` |
| 500–999 | `XL` |
| ≥ 1000 | `XXL` |

### Modifikator durch POI-Relevanz

- `poiRelevanceSum ≥ 3.0` → eine Stufe **hoch** (max `XXL`).
- `poiRelevanceSum ≥ 6.0` → zwei Stufen **hoch**.
- Event-aktiv (mind. ein POI mit `validFrom ≤ heute ≤ validTo`) → zusätzlich eine Stufe **hoch**, temporär; in `reasoning[]` als "Event-Boost" benannt.

### Modifikator durch Wartehaus

- `wartehaus = NO` und Basisgrösse ≥ `XL` → **eine Stufe runter** (ohne Wartefläche keine grossen statischen Tafeln sinnvoll).
- `wartehaus = UNKNOWN` → keine Anpassung, aber Confidence-Abzug.

---

## 2. Anzahl Elemente (`elementCount`)

| Bedingung | Empfohlene Anzahl |
|---|---|
| `S` | 1 |
| `M` | 1 |
| `L` | 1–2 (2 wenn `served_routes_count ≥ 3`) |
| `XL` | 2 |
| `XXL` | 2–3 (3 wenn `served_routes_count ≥ 5` ODER Event-aktiv) |

Sonderfälle:
- Eine Site mit getrennten Steigen (mehrere `BoardingPoint`s in gegensätzlichen Richtungen) wird **je Steig** berechnet, dann auf Site-Ebene summiert.
- POI-Hotspot (`poiRelevanceSum ≥ 6.0`) → `+1`, max 4.

---

## 3. Hardware-Integrationsklasse (`hardwareClass`)

Bestimmt durch die fünf Pflicht-Flags. Erste passende Regel gewinnt.

```
Input: dfiStandfuss, dfiStrommast, ticketautomat, strom, wartehaus  ∈ {YES, NO, UNKNOWN}

Wenn ALLE fünf Flags == UNKNOWN:
  → G_UNKNOWN
  → reasoning: "Datenlage unzureichend: alle Pflichtmerkmale unbekannt."

Sonst, in dieser Reihenfolge:

1. dfiStandfuss  == YES  → A_REUSE_DFI_STANDALONE
2. dfiStrommast  == YES  → B_REUSE_DFI_POLE
3. ticketautomat == YES  → C_REUSE_TICKET_MACHINE
4. wartehaus     == YES  → D_REUSE_SHELTER
5. strom         == YES  → E_POWER_AVAILABLE_NEW_MOUNT
6. strom == NO  AND wartehaus == NO  → F_NO_HARDWARE
7. sonst (zu viele UNKNOWN, kein YES)  → G_UNKNOWN
```

Wenn `G_UNKNOWN` zurückgegeben wird, muss `reasoning[]` explizit benennen, **welche** Flags `UNKNOWN` sind.

---

## 4. Score-Aufteilung (`scoreBreakdown`)

```
frequency      = f_freq(weekdayDeparturesSum)                ∈ [0, 1]
poiRelevance   = f_poi(poiRelevanceSum, eventsActive)        ∈ [0, 1]
infrastructure = f_infra(hardwareInventory)                  ∈ [0, 1]
```

### Frequenz-Funktion

```
f_freq(d) = min(1.0, log10(max(d, 1)) / 3.0)    // 1000 Abfahrten → ~1.0
```

### POI-Relevanz-Funktion

```
f_poi(sum, eventsActive) = clamp(0, 1, sum / 6.0 + (eventsActive ? 0.1 : 0))
```

### Infrastruktur-Funktion

Jeder bekannte `YES`-Wert zählt nach Gewicht:

| Flag | Gewicht |
|---|---|
| `dfiStandfuss = YES` | 0.30 |
| `dfiStrommast = YES` | 0.20 |
| `wartehaus = YES` | 0.20 |
| `strom = YES` | 0.20 |
| `ticketautomat = YES` | 0.10 |

`infrastructure` = Summe der Gewichte (max 1.0). `UNKNOWN` und `NO` zählen 0.

### Weighted Total

```
weightedTotal = 0.50 * frequency
              + 0.30 * poiRelevance
              + 0.20 * infrastructure
```

`weightedTotal` dient primär als interne Sortier-/Filtergrösse, nicht als Endempfehlung — `elementSize` und `hardwareClass` haben eigene Regeln (oben).

Hinweis: `OperatorArea` fliesst aktuell **nicht** in den Score ein (im MVP nur `VBZ` aktiv). Falls später unterschiedliche Gewichtung je Betreiber-Gebiet gewünscht ist, hier ergänzen.

---

## 5. Confidence

```
knownFlags = Anzahl Flags mit Wert ≠ UNKNOWN   (0..5)

confidenceBase = knownFlags / 5.0

Abzüge:
- ImportRun.status == NEEDS_REVIEW (kein sicheres Site-Match):     -0.20
- POI-Daten älter als 12 Monate:                                   -0.10
- GTFS älter als 90 Tage:                                          -0.10
- Hardware-Inventar älter als 12 Monate:                           -0.10

confidence = clamp(0.0, 1.0, confidenceBase - Σ Abzüge)
```

### Confidence-Schwellen für UI

| Confidence | Label | Farbe (Vorschlag) |
|---|---|---|
| ≥ 0.8 | Hoch | grün |
| 0.5–0.79 | Mittel | gelb |
| < 0.5 | Niedrig | rot |

Empfehlungen mit Confidence < 0.3 erhalten in der UI den Hinweis "Datenlage zu schwach für belastbare Empfehlung".

---

## 6. `reasoning[]` — Aufbau

Strukturierte Bullets, jeweils mit Grund + Beleg:

```
[
  "Empfohlene Grösse L: 312 Abfahrten/Tag (Schwelle 200).",
  "POI-Relevanz im 300-m-Radius: 4.0 (CRITICAL + 2 × HIGH) → eine Grössenstufe hoch.",
  "Hardware-Klasse A_REUSE_DFI_STANDALONE: DFI mit Standfuss bereits vorhanden.",
  "Confidence 0.80: 5/5 Pflichtmerkmale bekannt, GTFS aktuell."
]
```

Regeln:
- Mindestens **ein Bullet pro Output-Feld** (Grösse, Anzahl, Hardware-Klasse, Confidence).
- Schwellwerte und Zahlen mitschreiben — Planer:innen sollen den Rechenweg sehen.
- Bei Confidence < 0.5: explizite Auflistung der fehlenden / unsicheren Inputs.

---

## Versionierung

Jede Änderung an Schwellen, Gewichten oder Regeln bumpt `ruleVersion`:

- Patch (`0.3.x`): Schwellwerte verschoben, Texte angepasst.
- Minor (`0.x.0`): neue Faktoren, neue Reasoning-Zeilen.
- Major (`x.0.0`): inkompatible Strukturänderung an `Recommendation` (z. B. neue Pflichtfelder).

Alte `Recommendation`-Snapshots bleiben mit ihrer `ruleVersion` reproduzierbar — `inputsSnapshot` ist Pflichtfeld und friert die Inputs zur Berechnungszeit ein.
