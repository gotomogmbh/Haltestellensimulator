# Technische Architektur — Haltestellensimulator MVP

Konsolidierte Architekturentscheidung. Begleitend zu `concept.md` (Was), `data-model.md` (Welche Daten) und `import-pipeline.md` (Wie kommen sie rein).

## Stack-Entscheidung

| Schicht | Technologie | Begründung |
|---|---|---|
| App-Framework | **Next.js + TypeScript** (App Router) | Eine Codebasis für SSR-Pages, API-Routen und Static-Dashboard; Route Handlers ersetzen separates Backend |
| Datenbank | **PostgreSQL 16 + PostGIS 3.x** | Räumliche Queries (POI-Radius, Geo-Matching) sind Kernfunktion; keine Workarounds in App-Code |
| ORM | **Prisma** | Konsistenz mit übrigen Gotomo-Projekten; PostGIS-Geometrie via `Unsupported(...)` + `$queryRaw` für räumliche Queries |
| Karte | **MapLibre GL** + **OpenFreeMap** (Vector Tiles, OSM-basiert, kostenfrei, kein API-Key) | Data-driven Styling, GPU-Performance für ~3 000 Stops + POIs; umgeht OSM Tile Usage Policy |
| Upload-Storage | Lokal `storage/uploads/` via `StorageAdapter`-Interface | MVP-Pragmatik; Adapter erlaubt späteren Wechsel auf Supabase Storage oder S3 ohne API-Refactor |
| Excel/CSV-Parsing | `exceljs` + `papaparse` | bewährt, leichtgewichtig |
| Validierung | **Zod** | Schema-First-Validation für Uploads UND Persistenz-Reads |
| Tests | Vitest + Testing Library | gleicher Standard wie übrige TS-Projekte |

## Leaflet vs MapLibre — warum MapLibre

| Kriterium | Leaflet | MapLibre GL | Relevanz |
|---|---|---|---|
| Setup | minimal (raster OSM) | mittel (Style + Vector-Tile-Source) | – |
| Bundle | ~40 KB | ~200 KB | – |
| Performance bei ~3 000 Stops + POIs + Radius-Overlays | OK mit Cluster-Plugin, ruckelt bei vielen Custom-Markern | GPU-beschleunigt, skaliert auf 10 k+ Features | **+** |
| **Data-driven Styling** (Farbe nach HW-Klasse, Opacity nach Confidence) | verbose, JS pro Marker | native Style-Expressions | **++** |
| Radius-Layer (300 m um jeden Stop) | manuell pro Marker | nativ als Source+Layer | **+** |
| OSM-Tile-Policy in Produktion | raster Tiles = Policy zu lösen | Vector Tiles via OpenFreeMap → Policy umgangen | **+** |

**Entscheidung**: MapLibre GL, weil unser Kern-UX "Karte mit datengetriebener Färbung von tausenden Punkten" ist. Der einmalige Setup-Mehraufwand (~½ Tag) amortisiert sich gegen die Alternative, in Leaflet jede Färbung pro Marker per JS zu rendern.

Tile-Migrationspfad (falls OpenFreeMap nicht reicht): MapTiler (kostenpflichtig) oder selbst gehostete `pmtiles`.

## Projektstruktur

```
haltestellensimulator/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx, page.tsx              # Dashboard
│   │   ├── map/page.tsx
│   │   ├── stops/page.tsx, stops/[id]/page.tsx
│   │   ├── imports/page.tsx, imports/[id]/page.tsx
│   │   ├── pois/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── uploads/{excel,gtfs,poi}/route.ts
│   │       ├── imports/[id]/route.ts
│   │       ├── stops/[id]/recommendation/route.ts
│   │       ├── recommendations/recompute/route.ts
│   │       └── exports/recommendations/route.ts
│   ├── features/                             # vertikale Slices
│   │   ├── imports/, stops/, pois/, recommendations/, map/
│   ├── lib/
│   │   ├── db.ts                             # Prisma Singleton
│   │   ├── storage/                          # adapter.ts, local-fs.ts, index.ts
│   │   ├── parsers/                          # excel-stops.ts, gtfs.ts, poi.ts
│   │   ├── matching/stop-matcher.ts
│   │   ├── scoring/                          # engine, size, count, hardware-class, confidence, reasoning
│   │   ├── osm/                              # nominatim.ts (rate-limited), overpass.ts (backlog)
│   │   └── logging/import-log.ts
│   ├── components/
│   │   ├── map/                              # MapLibre-Wrapper, "use client"
│   │   ├── stop-detail/, upload/, ui/
│   └── types/domain.ts
├── scripts/
│   ├── import-gtfs.ts                        # CLI für grosse Pakete
│   └── recompute-all.ts                      # CLI
├── storage/                                  # Inhalt gitignored
│   ├── uploads/{excel,gtfs,poi}/
│   └── processed/
├── data/samples/
├── docker-compose.yml                        # Postgres+PostGIS, lokal
├── .env.example, next.config.ts, tsconfig.json, package.json
└── docs/                                     # bereits vorhanden
```

**Konventionen:**
- **Feature-Folder + lib/-Schicht** statt klassisches "Controller/Service/DAO". Vertikale Slices in `features/`, geteilte Bausteine in `lib/`.
- **`lib/storage/adapter.ts` als Interface** — `local-fs.ts` heute, `supabase.ts`/`s3.ts` später ohne API-Refactor.
- **GTFS-Import als CLI**, nicht über API. Datei ist gross (50–200 MB), Verarbeitung dauert Minuten → gehört nicht in HTTP-Request.
- **MapLibre-Komponenten ausschliesslich client-side** (`"use client"` + `dynamic(..., { ssr: false })`).
- **Validierung mit Zod** auf jedem API-Body und jedem `JSONB`-Read aus der DB.

## Datenbank-Schema (Tabellenübersicht)

Details der Felder → `data-model.md`. PostGIS-Aspekte hier:

| Tabelle | Räumliche Felder | Indexe |
|---|---|---|
| `stops` | `location geometry(Point, 4326)` | GIST(location), unique gtfs_stop_id, unique didok_number |
| `stop_attributes` | – | PK stop_id |
| `stop_frequencies` | – | PK stop_id |
| `poi_locations` | `location geometry(Point, 4326)` | GIST(location) |
| `stop_poi_contexts` | – | PK stop_id |
| `recommendations` | – | (stop_id, computed_at DESC) |
| `import_batches` | – | (kind, status), (received_at DESC) |
| `import_logs` | – | PK batch_id |
| `gtfs_packages` | – | unique hash |

**Spatial Queries via `$queryRaw`:**
```sql
-- POI-Kontext (Radius 300 m)
SELECT count(*), sum(relevance_weight)
FROM poi_locations
WHERE ST_DWithin(location::geography, $1::geography, 300);

-- Geo-Matching Excel ↔ GTFS-Stops
SELECT id FROM stops
WHERE ST_DWithin(location::geography, ST_MakePoint($lon, $lat)::geography, 50);
```

## API-Routen

| Methode | Route | Zweck |
|---|---|---|
| POST | `/api/uploads/excel` | Excel hochladen → synchroner Import |
| POST | `/api/uploads/poi` | POI hochladen → synchroner Import |
| POST | `/api/uploads/gtfs` | GTFS-Paket registrieren (Verarbeitung via CLI) |
| GET | `/api/imports`, `/api/imports/[id]` | Batch-Liste + Detail-Log |
| GET | `/api/stops` (Filter: owner, hwClass, confidenceMin, bbox) | Listenansicht |
| GET | `/api/stops/[id]` | Detail |
| GET | `/api/stops/[id]/recommendation` | Neueste Empfehlung |
| GET | `/api/stops/[id]/recommendations` | Historie |
| POST | `/api/recommendations/recompute` | Recompute (klein synchron, sonst CLI) |
| GET | `/api/pois` | Liste |
| POST | `/api/pois/[id]/geocode` | Nominatim-Einzel-Lookup, rate-limited |
| GET | `/api/exports/recommendations` | Excel-/CSV-Export |
| GET | `/api/health` | Liveness |

Konventionen:
- Antworten immer `{ data, error? }`.
- Pagination cursor-basiert (`?cursor=`, `?limit=`).
- Bulk-Geocoding ist auf API-Ebene **gesperrt** (max 1 POI pro Call).

## Import-Jobs

| Quelle | Volumen | Wo | Pattern |
|---|---|---|---|
| Excel-Bestand | ~5 MB, ~3 000 Zeilen | API-Request | parse → validate → match → persist → log |
| POI / Events | ~1 MB, ~1 000 Zeilen | API-Request | parse → validate → persist (kein Stop-Matching, das passiert beim Scoring) |
| GTFS | 50–200 MB ZIP | **CLI** `pnpm gtfs:import <zip>` | unzip → bulk insert → frequenzen → log |
| Recompute Empfehlungen | – | klein API, gross CLI | iteriere Stops → scoring → persist |

Pflicht (aus CLAUDE.md): jeder Job schreibt `ImportBatch` + `ImportLog`, auch im Fehlerfall. Zusätzlich Append in `storage/processed/import-log.jsonl` als File-Audit.

Job-Queue (BullMQ/Inngest) kommt nach MVP, sobald paralleler GTFS-Bedarf oder Multi-User entsteht.

## Seitenstruktur

| Route | Inhalt | Rendering |
|---|---|---|
| `/` | Dashboard: Counts, Confidence-Verteilung, neueste Importe | Server Component |
| `/map` | MapLibre + Stop-Layer (Farbe nach HW-Klasse, Opacity nach Confidence), POI-Toggle, Filter-Sidebar | Client (`ssr: false`) |
| `/stops` | Tabelle, Default-Filter `owner=VBZ` | Server + Client-Filter |
| `/stops/[id]` | Inputs + Empfehlung + Reasoning + Score-Breakdown + Historie | Server |
| `/imports`, `/imports/[id]` | Batches + Log-Viewer (Rejections-Tabelle) | Server |
| `/pois` | Tabelle, Einzel-Geocode-Button | Server + Client |
| `/settings` | Scoring-Parameter (read-only MVP), Tile-URL, GTFS-Quelle | Server |

OSM-Attribution **persistent in der Map-Komponente** (Footer-Ecke).

## Reihenfolge der Implementierung

| # | Schritt | DoD |
|---|---|---|
| 1 | Bootstrap: Next.js + TS + Tailwind, Lint/Format, `docker-compose.yml` (Postgres+PostGIS), Prisma init | `pnpm dev` lädt Seite, DB läuft lokal |
| 2 | Prisma-Schema + erste Migration (Enums + Models + Indexe + PostGIS Extension) | `prisma migrate dev` grün |
| 3 | StorageAdapter-Interface + LocalFsAdapter | Upload landet in `storage/uploads/...`, Tests grün |
| 4 | Excel-Import (Parser + Enum-Normalisierung + Validation + Batch/Log) — ohne Matching | Sample-Excel → Stops + Attributes |
| 5 | GTFS-CLI-Import | `pnpm gtfs:import` lädt Stops + Frequenzen |
| 6 | GTFS-Matching im Excel-Import (DiDok → Name+Geo → Fuzzy) | matched/unmatched-Counts stimmen |
| 7 | POI-Import + räumliche Aggregation (`StopPoiContext`) | Sample-POIs zu Counts pro Stop |
| 8 | Scoring-Engine + `rule_version` | Snapshot-Tests grün, plausible Empfehlungen |
| 9 | API-Routen für Uploads/Imports/Stops/Recommendations/POIs | alle Endpoints funktional |
| 10 | UI `/imports` + Upload-Flows | erster end-to-end Durchstich |
| 11 | UI `/stops` + `/stops/[id]` | Empfehlung pro Stop sichtbar |
| 12 | UI `/map` (MapLibre + OpenFreeMap, Layer + Filter) | Karte + Detail-Drawer flüssig |
| 13 | Export + Dashboard | MVP-Demo bereit |

Backlog nach MVP: Nominatim-Einzel-Geocoding, Overpass-Vorschläge, Auth/Multi-User, Snapshot-Vergleich, Bulk-Edit, eigener Tile-Server.
